import { Sha256 } from '@aws-crypto/sha256-js';
import { SignatureV4 } from '@smithy/signature-v4';
import { getPortalCredentials } from './storage.js';

const config = window.__PORTAL_CONFIG__ || {};
const $ = (id) => document.getElementById(id);
const SERVICE_NAMES = {
  apigateway: 'API Gateway',
  cloudformation: 'CloudFormation',
  cloudfront: 'CloudFront',
  cloudwatch: 'CloudWatch',
  cognito: 'Cognito',
  dynamodb: 'DynamoDB',
  ec2: 'EC2',
  iam: 'IAM',
  lambda: 'Lambda',
  rds: 'RDS',
  route53: 'Route 53',
  s3: 'S3',
  sqs: 'SQS',
  sns: 'SNS',
};
const SERVICE_CONSOLES = {
  apigateway: 'apigateway/main',
  cloudformation: 'cloudformation/home',
  cloudfront: 'cloudfront/v4/home',
  cloudwatch: 'cloudwatch/home',
  cognito: 'cognito/home',
  dynamodb: 'dynamodbv2/home',
  ec2: 'ec2/home',
  iam: 'iam/home',
  lambda: 'lambda/home',
  rds: 'rds/home',
  route53: 'route53/v2/hostedzones',
  s3: 's3/buckets',
  sqs: 'sqs/v3/home',
  sns: 'sns/v3/home',
};
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 });

function readableBytes(value) {
  if (!Number.isFinite(value)) return 'Size not reported yet';
  if (value === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / (1024 ** index);
  return `${amount.toFixed(amount >= 100 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function resourceName(resource) {
  if (resource.name) return resource.name;
  const arn = resource.arn || '';
  return arn.split(/[/:]/).filter(Boolean).at(-1) || resource.type || 'AWS resource';
}

function consoleLink(resource) {
  const service = resource.service?.toLowerCase() || '';
  const region = ['cloudfront', 'iam', 'route53'].includes(service) ? 'us-east-1' : (resource.region || config.region || 'eu-west-1');
  const arn = resource.arn || '';
  const name = resourceName(resource);
  if (service === 's3') return `https://s3.console.aws.amazon.com/s3/buckets/${encodeURIComponent(name)}?region=${encodeURIComponent(region)}`;
  if (service === 'lambda') return `https://console.aws.amazon.com/lambda/home?region=${encodeURIComponent(region)}#/functions/${encodeURIComponent(name)}`;
  if (service === 'dynamodb') return `https://console.aws.amazon.com/dynamodbv2/home?region=${encodeURIComponent(region)}#table?name=${encodeURIComponent(name)}`;
  if (service === 'rds') return `https://console.aws.amazon.com/rds/home?region=${encodeURIComponent(region)}#database:id=${encodeURIComponent(name)};is-cluster=false`;
  if (service === 'ec2' && resource.type?.includes('instance')) return `https://console.aws.amazon.com/ec2/home?region=${encodeURIComponent(region)}#InstanceDetails:instanceId=${encodeURIComponent(name)}`;
  const path = SERVICE_CONSOLES[service];
  if (path) return `https://console.aws.amazon.com/${path}?region=${encodeURIComponent(region)}`;
  return `https://console.aws.amazon.com/resource-explorer/home?region=${encodeURIComponent(region)}&search=${encodeURIComponent(arn)}`;
}

function serviceName(service) {
  return SERVICE_NAMES[service?.toLowerCase()] || (service || 'Other').replace(/-/g, ' ');
}

function signedFetchUrl(url) {
  const request = {
    protocol: url.protocol,
    hostname: url.hostname,
    method: 'GET',
    path: url.pathname || '/',
    headers: { host: url.host },
    query: {},
  };
  return request;
}

async function loadInventory() {
  if (!config.awsInventoryUrl) throw new Error('AWS inventory is not configured yet.');
  const url = new URL(config.awsInventoryUrl);
  const signer = new SignatureV4({
    credentials: getPortalCredentials,
    region: config.region,
    service: 'lambda',
    sha256: Sha256,
  });
  const signed = await signer.sign(signedFetchUrl(url));
  const headers = new Headers(signed.headers);
  headers.delete('host'); // Browsers set this protected header automatically.
  const response = await fetch(url, { method: 'GET', headers, cache: 'no-store' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `AWS inventory returned ${response.status}.`);
  return result;
}

export function createAwsResourcesUI() {
  let resources = [];
  let bucketSizes = {};
  let lambdaCosts = {};
  let generation = 0;

  function renderSummary(data) {
    const buckets = Object.values(bucketSizes);
    const storageBytes = buckets.reduce((sum, bucket) => sum + (bucket.sizeBytes || 0), 0);
    const storageEstimate = buckets.reduce((sum, bucket) => sum + (bucket.estimatedMonthlyUsd || 0), 0);
    const computeEstimate = Object.values(lambdaCosts).reduce((sum, item) => sum + (item?.estimatedUsd || 0), 0);
    const regions = new Set(resources.map(item => item.region).filter(Boolean));
    const total = document.createElement('article');
    total.className = 'aws-summary-card';
    total.innerHTML = '<span>Discovered resources</span><strong></strong><small></small>';
    total.querySelector('strong').textContent = resources.length.toLocaleString();
    total.querySelector('small').textContent = `${regions.size} AWS regions · refreshed ${new Date(data.generatedAt).toLocaleString()}`;
    const storage = document.createElement('article');
    storage.className = 'aws-summary-card';
    storage.innerHTML = '<span>S3 storage</span><strong></strong><small></small>';
    storage.querySelector('strong').textContent = readableBytes(storageBytes);
    const unpricedBuckets = buckets.filter(bucket => bucket.estimatedMonthlyUsd == null).length;
    storage.querySelector('small').textContent = `≈ ${money.format(storageEstimate)} / month · S3 Standard baseline${unpricedBuckets ? ` · ${unpricedBuckets} bucket(s) not priced` : ''}`;
    const compute = document.createElement('article');
    compute.className = 'aws-summary-card';
    compute.innerHTML = '<span>Lambda compute</span><strong></strong><small></small>';
    compute.querySelector('strong').textContent = money.format(computeEstimate);
    compute.querySelector('small').textContent = 'Estimated month to date, before free tier and tax';
    $('#aws-summary').replaceChildren(total, storage, compute);
  }

  function renderResources() {
    const query = $('#aws-search').value.trim().toLocaleLowerCase();
    const regionFilter = $('#aws-region-filter').value;
    const serviceFilter = $('#aws-service-filter').value;
    const visible = resources.filter(resource => {
      const searchText = `${resource.name || ''} ${resource.arn || ''} ${resource.type || ''} ${resource.service || ''} ${resource.region || ''}`.toLocaleLowerCase();
      return (!query || searchText.includes(query))
        && (!regionFilter || resource.region === regionFilter)
        && (!serviceFilter || resource.service === serviceFilter);
    });
    const groups = new Map();
    for (const resource of visible) {
      const service = resource.service || 'other';
      if (!groups.has(service)) groups.set(service, []);
      groups.get(service).push(resource);
    }

    const fragment = document.createDocumentFragment();
    for (const [service, items] of [...groups].sort(([a], [b]) => serviceName(a).localeCompare(serviceName(b)))) {
      const section = document.createElement('section');
      section.className = 'aws-service-group';
      const heading = document.createElement('div');
      heading.className = 'aws-service-heading';
      const title = document.createElement('h3');
      title.textContent = serviceName(service);
      const count = document.createElement('span');
      count.textContent = `${items.length} ${items.length === 1 ? 'resource' : 'resources'}`;
      heading.append(title, count);
      const list = document.createElement('div');
      list.className = 'aws-resource-grid';

      for (const resource of items) {
        const card = document.createElement('article');
        card.className = 'aws-resource-card';
        const top = document.createElement('div');
        top.className = 'aws-resource-top';
        const resourceTitle = document.createElement('h4');
        resourceTitle.textContent = resourceName(resource);
        const type = document.createElement('span');
        type.className = 'aws-type-tag';
        type.textContent = resource.type || service;
        top.append(resourceTitle, type);
        const location = document.createElement('p');
        location.className = 'aws-resource-location';
        location.textContent = resource.region || 'Global service';
        card.append(top, location);

        if (service === 's3') {
          const stats = bucketSizes[resourceName(resource)];
          const detail = document.createElement('p');
          detail.className = 'aws-resource-detail';
          detail.textContent = stats
            ? `${readableBytes(stats.sizeBytes)} · ${stats.objectCount == null ? 'object count unavailable' : `${stats.objectCount.toLocaleString()} objects`}`
            : 'Storage metrics are not available yet.';
          card.append(detail);
          if (stats?.estimatedMonthlyUsd != null) {
            const cost = document.createElement('p');
            cost.className = 'aws-resource-cost';
            cost.textContent = `≈ ${money.format(stats.estimatedMonthlyUsd)} / month · Standard-rate estimate`;
            card.append(cost);
          }
        } else if (service === 'lambda') {
          const usage = lambdaCosts[`${resource.region}:${resourceName(resource)}`];
          const detail = document.createElement('p');
          detail.className = 'aws-resource-detail';
          detail.textContent = usage
            ? `${usage.invocations.toLocaleString()} invocations this month · ${usage.memoryMb} MB · ${usage.architecture}`
            : 'Usage metrics are unavailable for this function.';
          card.append(detail);
          if (usage) {
            const cost = document.createElement('p');
            cost.className = 'aws-resource-cost';
            cost.textContent = `≈ ${money.format(usage.estimatedUsd)} this month · before free tier`;
            card.append(cost);
          }
        } else {
          const detail = document.createElement('p');
          detail.className = 'aws-resource-detail';
          detail.textContent = 'Usage-based cost varies; this board does not estimate this resource type.';
          card.append(detail);
        }

        if (resource.lastReportedAt) {
          const reported = document.createElement('p');
          reported.className = 'aws-resource-reported';
          reported.textContent = `Inventory reported ${new Date(resource.lastReportedAt).toLocaleDateString()}`;
          card.append(reported);
        }
        const action = document.createElement('a');
        action.className = 'aws-console-link';
        action.href = consoleLink(resource);
        action.target = '_blank';
        action.rel = 'noopener noreferrer';
        action.textContent = 'Open in AWS Console ↗';
        card.append(action);
        list.append(card);
      }
      section.append(heading, list);
      fragment.append(section);
    }

    if (!visible.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = resources.length ? 'No resources match these filters.' : 'No resources were returned from the indexed regions.';
      fragment.append(empty);
    }
    $('#aws-resource-groups').replaceChildren(fragment);
    $('#aws-result-count').textContent = `Showing ${visible.length.toLocaleString()} of ${resources.length.toLocaleString()} resources.`;
  }

  function setFilters(data) {
    const regions = [...new Set(data.resources.map(item => item.region).filter(Boolean))].sort();
    const services = [...new Set(data.resources.map(item => item.service).filter(Boolean))].sort((a, b) => serviceName(a).localeCompare(serviceName(b)));
    const region = $('#aws-region-filter');
    const service = $('#aws-service-filter');
    region.replaceChildren(new Option('All regions', ''));
    service.replaceChildren(new Option('All services', ''));
    for (const item of regions) region.add(new Option(item, item));
    for (const item of services) service.add(new Option(serviceName(item), item));
  }

  async function refresh() {
    const id = ++generation;
    const button = $('#aws-refresh');
    button.disabled = true;
    $('#aws-status').textContent = 'Discovering resources and reading usage metrics…';
    $('#aws-error').hidden = true;
    try {
      const data = await loadInventory();
      if (id !== generation) return;
      resources = Array.isArray(data.resources) ? data.resources : [];
      bucketSizes = data.bucketSizes || {};
      lambdaCosts = data.lambdaCosts || {};
      renderSummary(data);
      setFilters(data);
      renderResources();
      $('#aws-status').textContent = data.indexedRegions?.length
        ? `Inventory searched ${data.indexedRegions.length} Resource Explorer regions. Bucket metrics are daily and may lag.`
        : 'Inventory refreshed. No indexed regions were returned.';
      $('#aws-warnings').textContent = Array.isArray(data.warnings) ? data.warnings.join(' ') : '';
      $('#aws-warnings').hidden = !data.warnings?.length;
    } catch (error) {
      if (id !== generation) return;
      $('#aws-error').textContent = error.message || 'AWS inventory could not be loaded.';
      $('#aws-error').hidden = false;
      $('#aws-status').textContent = '';
    } finally {
      if (id === generation) button.disabled = false;
    }
  }

  $('#aws-refresh').addEventListener('click', refresh);
  $('#aws-search').addEventListener('input', renderResources);
  $('#aws-region-filter').addEventListener('change', renderResources);
  $('#aws-service-filter').addEventListener('change', renderResources);

  return {
    start: refresh,
    refresh,
    stop() {
      generation += 1;
      resources = [];
      bucketSizes = {};
      lambdaCosts = {};
      $('#aws-resource-groups').replaceChildren();
      $('#aws-summary').replaceChildren();
    },
  };
}
