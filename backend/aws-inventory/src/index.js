import {
  ListIndexesCommand,
  ListResourcesCommand,
  ResourceExplorer2Client,
} from '@aws-sdk/client-resource-explorer-2';
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import { LambdaClient, ListFunctionsCommand } from '@aws-sdk/client-lambda';
import {
  GetBucketLocationCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

const HOME_REGION = process.env.HOME_REGION || 'eu-west-1';
const regionClient = new Map();
const explorer = (region) => {
  if (!regionClient.has('explorer:' + region)) {
    regionClient.set('explorer:' + region, new ResourceExplorer2Client({ region }));
  }
  return regionClient.get('explorer:' + region);
};
const s3 = (region = HOME_REGION) => {
  if (!regionClient.has('s3:' + region)) regionClient.set('s3:' + region, new S3Client({ region }));
  return regionClient.get('s3:' + region);
};
const cloudwatch = (region) => {
  if (!regionClient.has('cloudwatch:' + region)) regionClient.set('cloudwatch:' + region, new CloudWatchClient({ region }));
  return regionClient.get('cloudwatch:' + region);
};
const lambda = (region) => {
  if (!regionClient.has('lambda:' + region)) regionClient.set('lambda:' + region, new LambdaClient({ region }));
  return regionClient.get('lambda:' + region);
};

function resourceName(resource) {
  const properties = Object.fromEntries((resource.Properties || []).map((item) => [
    item.Name,
    item.Value?.StringValue ?? item.Value?.LongValue ?? item.Value?.BooleanValue,
  ]));
  if (properties.Name) return properties.Name;
  return (resource.Arn || '').split(/[/:]/).filter(Boolean).at(-1) || resource.ResourceType || 'AWS resource';
}

function normalize(resource) {
  return {
    arn: resource.Arn,
    name: resourceName(resource),
    service: resource.Service || 'other',
    type: resource.ResourceType || 'resource',
    region: resource.Region || null,
    lastReportedAt: resource.LastReportedAt?.toISOString?.() || null,
  };
}

async function listAllResources(region) {
  const found = [];
  let nextToken;
  do {
    const page = await explorer(region).send(new ListResourcesCommand({ MaxResults: 1000, NextToken: nextToken }));
    found.push(...(page.Resources || []).map(normalize));
    nextToken = page.NextToken;
  } while (nextToken);
  return found;
}

function bucketRegion(location) {
  if (!location) return 'us-east-1';
  return location === 'EU' ? 'eu-west-1' : location;
}

async function inspectBucket(bucket) {
  let region = HOME_REGION;
  let sizeBytes = 0;
  let objectCount = 0;
  let continuationToken;
  try {
    const location = await s3().send(new GetBucketLocationCommand({ Bucket: bucket.Name }));
    region = bucketRegion(location.LocationConstraint);
    do {
      const page = await s3(region).send(new ListObjectsV2Command({
        Bucket: bucket.Name,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      }));
      for (const object of page.Contents || []) {
        sizeBytes += object.Size || 0;
        objectCount += 1;
      }
      continuationToken = page.NextContinuationToken;
    } while (continuationToken);
  } catch (error) {
    return { name: bucket.Name, region, error: error.name || 'Unable to list bucket' };
  }
  return { name: bucket.Name, region, sizeBytes, objectCount, observedAt: new Date().toISOString() };
}

function estimateStorage(bucket) {
  if (!Number.isFinite(bucket.sizeBytes)) return null;
  const monthlyRates = {
    'ap-northeast-1': 0.025,
    'eu-central-1': 0.0245,
    'eu-west-1': 0.023,
    'eu-west-2': 0.023,
    'eu-west-3': 0.0245,
    'us-east-1': 0.023,
  };
  const rate = monthlyRates[bucket.region];
  if (rate == null) return null;
  return (bucket.sizeBytes / (1024 ** 3)) * rate;
}

async function listFunctions(region) {
  const functions = [];
  let marker;
  do {
    const page = await lambda(region).send(new ListFunctionsCommand({ MaxItems: 50, Marker: marker }));
    functions.push(...(page.Functions || []));
    marker = page.NextMarker;
  } while (marker);
  return functions;
}

async function sumLambdaMetric(region, functionName, metricName, start, end) {
  const response = await cloudwatch(region).send(new GetMetricStatisticsCommand({
    Namespace: 'AWS/Lambda',
    MetricName: metricName,
    Dimensions: [{ Name: 'FunctionName', Value: functionName }],
    StartTime: start,
    EndTime: end,
    Period: 3600,
    Statistics: ['Sum'],
  }));
  return (response.Datapoints || []).reduce((sum, point) => sum + (point.Sum || 0), 0);
}

async function estimateLambdaFunctions(regions, warnings) {
  const listed = await Promise.allSettled(regions.map(listFunctions));
  const functions = [];
  listed.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      functions.push(...result.value.map((item) => ({ ...item, region: regions[index] })));
    } else {
      warnings.push('Lambda functions could not be listed in ' + regions[index] + '.');
    }
  });

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const estimates = {};
  for (let offset = 0; offset < functions.length; offset += 10) {
    const batch = functions.slice(offset, offset + 10);
    const results = await Promise.allSettled(batch.map(async (fn) => {
      const [invocations, durationMs] = await Promise.all([
        sumLambdaMetric(fn.region, fn.FunctionName, 'Invocations', start, now),
        sumLambdaMetric(fn.region, fn.FunctionName, 'Duration', start, now),
      ]);
      const memoryMb = fn.MemorySize || 128;
      const architecture = fn.Architectures?.includes('arm64') ? 'arm64' : 'x86_64';
      const gbSeconds = (durationMs / 1000) * (memoryMb / 1024);
      const durationRate = architecture === 'arm64' ? 0.0000133334 : 0.0000166667;
      const estimatedUsd = (gbSeconds * durationRate) + (invocations * 0.2 / 1_000_000);
      return {
        key: fn.region + ':' + fn.FunctionName,
        invocations,
        durationMs,
        memoryMb,
        architecture,
        estimatedUsd,
      };
    }));
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') estimates[result.value.key] = result.value;
      else {
        warnings.push('Usage estimate unavailable for a Lambda function in ' + batch[index].region + '.');
        estimates[batch[index].region + ':' + batch[index].FunctionName] = null;
      }
    });
  }
  return estimates;
}

export async function inventory() {
  const indexResponse = await explorer(HOME_REGION).send(new ListIndexesCommand({}));
  const regions = [...new Set((indexResponse.Indexes || []).map((index) => index.Region).filter(Boolean))].sort();
  const warnings = [];
  const results = await Promise.allSettled(regions.map(listAllResources));
  const resources = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') resources.push(...result.value);
    else {
      console.warn('Resource Explorer search failed in ' + regions[index], result.reason?.name || 'UnknownError', result.reason?.message || '');
      warnings.push('Resource Explorer could not search ' + regions[index] + ' (' + (result.reason?.name || 'request error') + ').');
    }
  });

  const buckets = await s3().send(new ListBucketsCommand({}));
  const bucketSizes = {};
  const bucketResults = await Promise.allSettled((buckets.Buckets || []).map(inspectBucket));
  for (const result of bucketResults) {
    if (result.status !== 'fulfilled') {
      warnings.push('One or more S3 bucket sizes could not be read.');
      continue;
    }
    const bucket = result.value;
    bucketSizes[bucket.name] = { ...bucket, estimatedMonthlyUsd: estimateStorage(bucket) };
    if (bucket.error) warnings.push('Could not measure S3 bucket ' + bucket.name + ': ' + bucket.error + '.');
  }

  const unique = new Map(resources.map((resource) => [resource.arn, resource]));
  for (const bucket of Object.values(bucketSizes)) {
    const arn = 'arn:aws:s3:::' + bucket.name;
    if (!unique.has(arn)) unique.set(arn, {
      arn,
      name: bucket.name,
      service: 's3',
      type: 'bucket',
      region: bucket.region,
      lastReportedAt: bucket.observedAt,
    });
  }
  const lambdaCosts = await estimateLambdaFunctions(regions, warnings);
  return {
    generatedAt: new Date().toISOString(),
    indexedRegions: regions,
    resources: [...unique.values()].sort((a, b) =>
      (a.region || '').localeCompare(b.region || '')
      || a.service.localeCompare(b.service)
      || a.name.localeCompare(b.name)),
    bucketSizes,
    lambdaCosts,
    warnings,
  };
}

export async function handler(event) {
  if (event?.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }
  try {
    const data = await inventory();
    return { statusCode: 200, headers: { ...corsHeaders(event), 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(data) };
  } catch (error) {
    console.error('AWS inventory failed', error);
    return { statusCode: 502, headers: { ...corsHeaders(event), 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify({ error: 'AWS inventory could not be loaded. Check the function logs.' }) };
  }
}

function corsHeaders(event) {
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
  const origin = event?.headers?.origin;
  return {
    ...(origin && allowed.includes(origin) ? { 'access-control-allow-origin': origin, vary: 'origin' } : {}),
    'access-control-allow-methods': 'GET,OPTIONS',
    'access-control-allow-headers': 'authorization,x-amz-date,x-amz-security-token,x-amz-content-sha256',
    'access-control-max-age': '3600',
  };
}
