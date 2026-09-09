(() => {
  'use strict';

  const sources = {
    sip: ['SIP protocol reference', 'https://www.rfc-editor.org/rfc/rfc3261'],
    media: ['RTP / RTCP reference', 'https://www.rfc-editor.org/rfc/rfc3550'],
    queues: ['RingCX queue configuration', 'https://developers.ringcentral.com/engage/voice/guide/routing/queues/queues'],
    agents: ['RingCX agent configuration', 'https://developers.ringcentral.com/engage/voice/guide/users/agents/agents'],
    identity: ['RingCX authentication variants', 'https://developers.ringcentral.com/engage/voice/guide/authentication'],
    userLogin: ['RingCentral app sign-in and SSO guide', 'https://assets.ringcentral.com/us/guide/RingCentral_App_Getting_Started_Guide.pdf'],
    exchange: ['Linked RingCentral / RingCX API authentication', 'https://developers.ringcentral.com/engage/voice/guide/authentication/auth-ringcentral'],
    phone: ['RingCentral WebPhone implementation example', 'https://github.com/ringcentral/ringcentral-web-phone'],
    ivr: ['Engage Voice IVR overview', 'https://netstorage.ringcentral.com/datasheets/engage_voice_ivr.pdf'],
    outbound: ['RingCX outbound dialing modes', 'https://www.ringcentral.com/ringcx/outbound.html']
  };

  // These are functional teaching steps, not an inventory of vendor services.
  function step(name, description, example, proof, failure, inspect, source) {
    return { name, description, example, proof, failure, inspect, source };
  }

  const flows = {
    inbound: {
      scope: 'Contact-center example', title: 'A customer calls support',
      description: 'The caller reaches your number, hears a menu, joins a queue and speaks with an eligible agent. Direct extension calls can skip the menu and queue.',
      steps: [
        step('Caller', 'A customer dials the business number from a phone. This does not require a RingCentral user account.', 'A customer calls the support number on an invoice.', 'A dated call attempt with the correct destination number.', 'The customer dialed the wrong number, or the originating network could not start the call.', 'Confirm the dialed number and timezone. If no call reaches your observed edge, request originating-carrier evidence.', 'sip'),
        step('Carrier', 'The public telephone network delivers the call toward the provider serving the business number.', 'The customer’s mobile carrier routes the support number to the voice provider.', 'An incoming call leg reaches an observed provider boundary.', 'Number routing, a porting issue or an upstream carrier failure can stop delivery.', 'In Hoof, look for the ingress INVITE if captured. Check the actual destination and first responding hop. Compare another origin or destination.', 'sip'),
        step('Voice entry', 'The voice service associates the called number with the configured destination. A network edge may include an SBC; its exact placement is deployment-specific.', 'The business number points to the support IVR during opening hours.', 'The intended number mapping and destination are selected.', 'Wrong number mapping, closed-hours handling or a routing rejection.', 'Compare configured number and schedule with routing logs in Kibana. In Hoof, find the first divergent hop or final response.', 'queues'),
        step('IVR / VRU', 'The caller hears prompts and selects an option. The flow uses that input to choose the next destination.', '“Press 1 for support” sends this caller to the Support queue.', 'The prompt plays, the expected digit is collected and the intended branch runs.', 'Missing audio prompt, unrecognized digits, a bad branch or a failed backend lookup.', 'In Kibana, inspect the IVR step, input and any lookup result. In Hoof, inspect the IVR leg and available media or digit events. Check the configured DTMF method.', 'ivr'),
        step('Queue / ACD', 'The queue waits for an agent who meets its routing rules. Queue access and availability both matter.', 'An available agent with access to Support receives the offer.', 'A queue event records an offer to an eligible agent.', 'Inactive queue, no eligible agents, schedule mismatch or an overflow/timeout rule.', 'In Kibana, follow queue entry, eligibility and offer events if logged. Check current configuration and agent state at the incident time. SIP alone does not explain every routing decision.', 'queues'),
        step('Agent & audio', 'The agent accepts through the configured voice endpoint. The customer and agent legs are connected; media must work in both directions.', 'The agent greets the customer and both can hear the conversation.', 'Agent connection plus working media in each direction, not merely an IVR answer.', 'An unreachable agent endpoint, missed offer, wrong audio device or media-path failure.', 'In Hoof, inspect both relevant legs, answer/ACK timing and media reports. In Kibana, match the offer to the agent session. Check headset and microphone permissions.', 'media')
      ]
    },
    outbound: {
      scope: 'Manual outbound example', title: 'An agent calls a customer',
      description: 'The agent initiates this example. Automated campaign modes can start calls and allocate agents differently. Use your product’s dialing-mode documentation.',
      steps: [
        step('Agent dials', 'A signed-in agent chooses the destination and starts a manual outbound call.', 'The agent calls a customer back about an open support ticket.', 'A call-start action is recorded for the correct agent and destination.', 'The browser or app never sends the action, or the agent session has expired.', 'In Kibana, search the agent and request time. Inspect the browser network error and session. No action reaching the service means SIP may not exist yet.', 'outbound'),
        step('Policy checks', 'The platform evaluates permissions and the applicable outbound configuration before attempting the call.', 'The agent has outbound access and uses an allowed caller ID.', 'The request is accepted with the expected agent, number and caller identity.', 'Missing outbound access, invalid number, disallowed caller ID or a campaign restriction where applicable.', 'Read the application response in Kibana and inspect the relevant configuration. Treat a deliberate policy block as a policy result, not automatically a carrier outage.', 'agents'),
        step('Voice service', 'The voice service creates the outbound leg. The agent voice connection may already exist or need establishing, depending on the product and mode.', 'The service starts a leg to the customer while maintaining the agent’s connection.', 'A correlated outbound attempt with an expected next hop.', 'Agent voice connection failure, setup error or route-selection failure.', 'Map the application interaction to each SIP Call-ID. Inspect agent and outbound legs separately in Hoof; inspect call-start errors in Kibana.', 'sip'),
        step('Carrier route', 'The call traverses the selected external route toward the customer’s telephone network.', 'The voice provider sends the call toward the customer’s mobile carrier.', 'Downstream progress or a meaningful final response on the chosen route.', 'Timeout, carrier rejection or a destination-specific routing failure.', 'Find the emitting hop and response in Hoof. Compare the Request-URI, number format and a successful call over the same route. Preserve response details.', 'sip'),
        step('Customer answers', 'The destination alerts and then answers, or returns a busy, unavailable or other outcome.', 'The customer’s phone rings and the customer picks up.', 'The destination leg accepts the INVITE and the caller side acknowledges it.', 'Busy, no answer, a cancellation or destination-side rejection.', 'Read the sequence rather than one code: 180 is alerting, not an answer. A 487 may follow a normal CANCEL. Compare timers with the observed behavior.', 'sip'),
        step('Audio & end', 'Media carries the conversation. On hangup, signaling ends the session and the application records its outcome.', 'Both parties hear each other, then the agent records the call disposition.', 'Bidirectional media and a teardown consistent with the actual hangup.', 'One-way sound, packet loss, unexpected disconnect or a missing application outcome.', 'Use Hoof for media direction, reports and who sent BYE. Use Kibana for session changes and outcome events. A clean SIP ending does not prove audio quality was good.', 'media')
      ]
    },
    user: {
      scope: 'Employee app login · conceptual', title: 'A user signs in to the phone app',
      description: 'Application authentication and phone readiness are separate checks. The WebPhone example below is documented for RingCentral’s WebRTC library; other clients can connect differently.',
      steps: [
        step('Open app', 'The employee opens the correct application and reaches its sign-in service.', 'A user opens the company’s approved phone app.', 'The app loads and can reach the configured sign-in destination.', 'DNS, proxy, TLS or application-loading failure before authentication.', 'Inspect the browser network panel or app diagnostics. Kibana only helps if the failed request reached a service whose logs you collect. A SIP search is premature.', 'phone'),
        step('Verify identity', 'The configured login method checks identity. A federated deployment can redirect the user to its identity provider for SSO and MFA.', 'The employee completes the company sign-in challenge.', 'The identity service records successful authentication for the intended user.', 'Invalid credentials, incomplete MFA, a disabled identity or a failed SSO exchange.', 'Inspect identity events and application response details. Establish the actual login method first. Do not assume every tenant uses the same identity provider.', 'userLogin'),
        step('Create session', 'The application establishes its authorized session after sign-in. Authentication success must reach the intended application.', 'The user returns from sign-in and the app opens the account.', 'The app accepts the session and subsequent authorized requests succeed.', 'Expired or rejected session, redirect mismatch or client session-storage problems.', 'Correlate the sign-in result with the application callback and subsequent API requests. Read the response body; do not paste tokens into an investigation ticket.', 'userLogin'),
        step('Load access', 'The app loads the user’s account and enabled capabilities. Opening the app does not guarantee voice entitlement.', 'The employee sees the intended extension and phone features.', 'The expected account, extension and voice access are present.', 'Wrong account, unavailable extension or missing voice access.', 'Compare user configuration with account-loading logs and API responses. A permission error is different from a failed password check.', 'phone'),
        step('Connect phone', 'The phone endpoint establishes its voice connection. RingCentral’s WebPhone library uses WebSocket/SIP registration as a separate operation.', 'The WebPhone endpoint registers successfully after the app is authorized.', 'The endpoint reports readiness; for the SIP example, the relevant registration succeeds.', 'WebSocket reachability, registration credentials, renewal or browser permission problems.', 'Inspect endpoint diagnostics and connection errors. Use Hoof only where registration traffic is collected. One 401 challenge followed by a successful retry can be normal.', 'phone'),
        step('Verify readiness', 'Confirm the intended endpoint can place or receive an approved test call and use the selected audio devices.', 'The app is open, the correct headset is selected and a test call works.', 'A successful call with working audio in each direction.', 'DND/routing settings, an offline endpoint, blocked microphone or wrong playback device.', 'Check app state, endpoint and audio permissions first. Then follow the appropriate inbound or outbound call flow. “Logged in” is not a complete voice-health check.', 'media')
      ]
    },
    agent: {
      scope: 'RingCX / Engage Voice · conditional flow', title: 'A contact-center agent becomes available',
      description: 'A valid user identity, an authorized agent session and a working voice endpoint must align. This is a functional checklist; screen order and login method vary by deployment.',
      steps: [
        step('Authenticate', 'The agent uses the login method provisioned for the account. Current linked RingCentral, direct Engage and legacy authentication are distinct variants.', 'An agent opens the correct RingCX or Engage login for their organization.', 'The configured authentication flow succeeds for that identity.', 'Wrong portal, wrong login method, failed MFA or rejected identity.', 'In Kibana, match the login attempt to the correct tenant and product. Check identity events and the first failing HTTP request. SIP is not the first tool for this step.', 'identity'),
        step('Link access', 'For linked RingCentral API integrations, a RingCentral token is exchanged for a RingCX token. This is a documented API flow, not a claim about every UI login.', 'A linked integration uses its RingCX token when calling RingCX Voice APIs.', 'The account link and required token exchange succeed where that flow applies.', 'Account not linked, wrong token type or rejected/expired token.', 'For an integration, inspect the exchange response and target API. Do not apply this flow to direct Engage or legacy credentials. Token contents must stay out of shared logs.', 'exchange'),
        step('Agent access', 'The product resolves the agent and the permissions needed for voice work.', 'The account contains this agent with inbound or outbound access as required.', 'The intended agent configuration loads with the expected permissions.', 'Wrong agent/account mapping, missing permission or disabled softphone access.', 'Compare the user identity, agent identifier, account and configuration. Use the actual logged fields. Do not assume an employee user ID equals an agent ID.', 'agents'),
        step('Agent session', 'The agent interface establishes a working session and its initial state. Queue or campaign access depends on the configured workflow.', 'The agent session starts, but the initial state may not make the agent eligible for calls.', 'A session/login event and the expected current state are recorded.', 'Session creation or refresh failure, stale state or disconnected client.', 'Inspect login/session events and subsequent state changes in Kibana. Compare the UI with the server’s recorded state and timestamp.', 'agents'),
        step('Voice endpoint', 'The agent connects through the configured softphone or phone destination. Some workflows use an offhook or agent leg separate from each customer leg.', 'The agent uses the approved softphone, or answers the configured phone connection.', 'The intended voice endpoint is connected and usable for this session.', 'Wrong destination, failed offhook/agent-leg setup, WebRTC network failure or unavailable microphone.', 'Inspect endpoint status and the agent leg in Hoof where captured. Check device and browser diagnostics. Use product-specific connection instructions.', 'agents'),
        step('Available', 'The agent must be eligible for the target queue and in the appropriate available state. Sign-in alone does not make the queue offer a call.', 'An available agent with Support access receives a Support call.', 'A logged queue offer matches an eligible agent with a working voice endpoint.', 'Unavailable/after-call state, wrong queue access, priority/skills mismatch or a missed offer.', 'Inspect queue settings, agent state at the time and offer events in Kibana. If the offer exists but voice fails, investigate the agent leg in Hoof.', 'queues')
      ]
    }
  };

  const incidents = {
    login: {
      area: 'Identity / application', title: 'User cannot sign in', flow: 'user', index: 1,
      boundary: 'Find the first failed request: app loading, identity verification or application session creation.',
      kibana: 'Match user, tenant and timestamp. Inspect identity results, HTTP status and the response body. If sign-in succeeds, follow the callback and next API request.',
      sip3: 'Usually not the starting point. An application login can fail before any SIP endpoint exists. A SIP authentication challenge is a different event.',
      check: 'Confirm the portal, login method, account status and client clock. A browser or upstream identity failure might not be present in your application logs.'
    },
    agent: {
      area: 'Agent state / routing', title: 'Signed in, but no calls arrive', flow: 'agent', index: 5,
      boundary: 'Separate an absent call offer from an offer that could not connect to the agent.',
      kibana: 'Inspect state at the incident time, queue access, inbound permission, routing eligibility, offers and timeouts. Compare the client display with server events.',
      sip3: 'If an offer was made, find the agent leg and its setup outcome. Check the configured voice destination and whether the endpoint answered.',
      check: 'Verify a waiting call actually targeted this queue. No queue eligibility means endpoint registration alone will not fix the issue.'
    },
    entry: {
      area: 'Carrier / number routing', title: 'The caller never reaches the menu', flow: 'inbound', index: 2,
      boundary: 'Establish whether the call reached your observed ingress before investigating the IVR.',
      kibana: 'Search the time, destination and interaction mapping. Inspect number assignment, opening-hours route and any rejected or alternate destination.',
      sip3: 'Look for the ingress INVITE and follow the called number through observed hops. Record the first rejection or missing response, not just the final displayed status.',
      check: 'If ingress is absent, check capture coverage and retention before concluding the carrier failed. Compare a successful call to the same number.'
    },
    ivr: {
      area: 'VRU / IVR interaction', title: 'The menu plays; the selection fails', flow: 'inbound', index: 3,
      boundary: 'The call reached the IVR. Determine whether input was missing, the wrong branch ran or a dependent lookup failed.',
      kibana: 'Inspect IVR step, collected input, selected branch, backend response and timeout. Match the published flow version and schedule.',
      sip3: 'Inspect the IVR leg and negotiated digit transport. Review digit events or media only if those are captured; a SIP ladder alone may not show keypad input.',
      check: 'Reproduce the same menu choice. Separate a missing DTMF event from a correctly received digit with incorrect routing logic.'
    },
    outbound: {
      area: 'Outbound policy / signaling', title: 'The call fails before ringing', flow: 'outbound', index: 3,
      boundary: 'First determine whether the application accepted the attempt and produced an outbound leg.',
      kibana: 'Inspect outbound permission, destination format, caller ID, applicable dialing restrictions and the call-start response.',
      sip3: 'Follow the INVITE to the last observed hop. Capture the exact final response, response origin, Request-URI and timings. Check for authenticated retries before treating 401/407 as a failure.',
      check: 'Compare other destinations and routes. A 403 is a refusal to investigate, not sufficient proof of a specific permission or carrier problem.'
    },
    audio: {
      area: 'Endpoint / media path', title: 'The call connects; one direction is silent', flow: 'inbound', index: 5,
      boundary: 'Name the missing direction, then inspect media separately from call setup.',
      kibana: 'Match the interaction and agent session. Inspect media setup, device changes, connection changes and app errors at the same timestamp.',
      sip3: 'Confirm both relevant call legs. Compare each media direction, SDP addresses and available RTP/RTCP reports. Identify where the expected stream stops being observable.',
      check: 'Check microphone, mute, speaker and headset. Missing packets at one sensor can mean missing capture. Do not conclude “firewall” from silence alone.'
    },
    quality: {
      area: 'Media quality / endpoint', title: 'Speech is choppy or delayed', flow: 'outbound', index: 5,
      boundary: 'Find which direction and time interval degrade. Averages can hide a short interruption.',
      kibana: 'Correlate client reconnects, endpoint errors and application timing. Compare affected users, sites, devices and recent changes.',
      sip3: 'Inspect available loss, jitter and quality reports over the affected interval, per leg and direction. Compare with a successful call and the same codec.',
      check: 'Check local Wi-Fi, congestion, headset and device load. A low MOS score identifies poor estimated quality; it does not identify the failing network segment by itself.'
    },
    drop: {
      area: 'Session / teardown', title: 'A connected call ends unexpectedly', flow: 'outbound', index: 5,
      boundary: 'Distinguish an explicit hangup from lost connectivity or a timeout.',
      kibana: 'Inspect the session timeline for logout, client disconnection, transfer, timeout or application error. Match any recent network change.',
      sip3: 'Find BYE, its sender and preceding events. If teardown is missing, inspect retransmissions, capture gaps and timing. Check the relevant leg; another leg may continue.',
      check: 'Use the observed sequence before suggesting a timer or network cause. Similar call duration across failures is a clue to compare, not proof of one fixed timeout.'
    },
    missing: {
      area: 'Observability coverage', title: 'No matching call appears in Hoof', flow: 'inbound', index: 1,
      boundary: 'First establish whether you are searching the right captured data.',
      kibana: 'Find a known application event and its timestamp, tenant, region and identifier mapping. Confirm whether a SIP leg was created at all.',
      sip3: 'Check timezone, absolute time window, search attributes, retention, permissions, sensor health and capture location. Try an expected endpoint or another leg identifier.',
      check: 'Hoof shows supplied telemetry. No result can mean no capture, a different Call-ID, ingestion delay or inaccessible data; it does not prove no call happened.'
    }
  };

  let activeFlow = 'inbound';
  let activeStep = 0;
  const byId = id => document.getElementById(id);
  const text = (id, value) => { byId(id).textContent = value; };

  function renderStep() {
    const flow = flows[activeFlow];
    const selected = flow.steps[activeStep];
    byId('flow-steps').querySelectorAll('button').forEach((button, index) => {
      button.setAttribute('aria-pressed', String(index === activeStep));
    });
    text('step-position', `Step ${activeStep + 1} / ${flow.steps.length}`);
    text('step-title', selected.name);
    text('step-description', selected.description);
    text('step-example', selected.example);
    text('step-proof', selected.proof);
    text('step-failure', selected.failure);
    text('step-inspect', selected.inspect);
    text('step-counter', `${activeStep + 1} of ${flow.steps.length} · ${selected.name}`);
    const [label, href] = sources[selected.source];
    const link = document.createElement('a');
    link.textContent = label;
    link.href = href;
    byId('step-reference').replaceChildren(link);
    byId('previous-step').disabled = activeStep === 0;
    byId('next-step').disabled = activeStep === flow.steps.length - 1;
  }

  function renderFlow(key, index = 0) {
    activeFlow = key;
    activeStep = index;
    const flow = flows[key];
    byId('flow-controls').querySelectorAll('button').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.flow === key));
    });
    text('flow-scope', flow.scope);
    text('flow-title', flow.title);
    text('flow-description', flow.description);
    const items = flow.steps.map((item, position) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-controls', 'step-panel');
      const number = document.createElement('span');
      number.textContent = String(position + 1).padStart(2, '0');
      button.append(number, document.createTextNode(item.name));
      button.addEventListener('click', () => { activeStep = position; renderStep(); });
      li.append(button);
      return li;
    });
    byId('flow-steps').replaceChildren(...items);
    renderStep();
  }

  function renderIncident() {
    const selected = incidents[byId('symptom').value];
    text('incident-area', selected.area);
    text('incident-title', selected.title);
    text('incident-boundary', selected.boundary);
    text('incident-kibana', selected.kibana);
    text('incident-sip3', selected.sip3);
    text('incident-check', selected.check);
  }

  byId('flow-controls').addEventListener('click', event => {
    const button = event.target.closest('button[data-flow]');
    if (button) renderFlow(button.dataset.flow);
  });
  byId('previous-step').addEventListener('click', () => {
    if (activeStep > 0) { activeStep--; renderStep(); }
  });
  byId('next-step').addEventListener('click', () => {
    if (activeStep < flows[activeFlow].steps.length - 1) { activeStep++; renderStep(); }
  });
  byId('symptom').addEventListener('change', renderIncident);
  byId('show-flow').addEventListener('click', () => {
    const incident = incidents[byId('symptom').value];
    renderFlow(incident.flow, incident.index);
    byId('flow-steps').querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
    byId('explorer').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  });
  renderFlow(activeFlow);
  renderIncident();
})();
