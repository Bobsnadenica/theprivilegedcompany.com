(() => {
  'use strict';

  // Functional teaching examples. Research is recorded in RESEARCH.md.
  const flows = {
  "inbound": {
    "scope": "Contact-center example",
    "title": "A customer calls support",
    "description": "Number, menu, queue, agent, audio. Direct employee calls can skip the menu and queue.",
    "steps": [
      {
        "name": "Business number",
        "description": "The caller’s carrier delivers the call. The voice platform finds the destination assigned to the business number.",
        "example": "The support number points to the support menu.",
        "proof": "The incoming call reaches the expected destination.",
        "failure": "Wrong number mapping, closed-hours route or carrier failure.",
        "inspect": "Hoof: find the incoming call. Kibana: check the selected number route and schedule."
      },
      {
        "name": "Menu / VRU",
        "description": "The menu plays a prompt and uses the caller’s choice to choose a destination.",
        "example": "Pressing 1 selects Support.",
        "proof": "The platform receives the digit and runs the correct branch.",
        "failure": "Missing prompt, unrecognized digit or failed lookup.",
        "inspect": "Kibana: inspect the menu step and collected input. Hoof: inspect the menu leg and captured digit events."
      },
      {
        "name": "Queue",
        "description": "The queue waits for an eligible agent. Being logged in is not enough.",
        "example": "Support offers the call to an available agent with queue access.",
        "proof": "An offer is recorded for an eligible agent.",
        "failure": "No eligible agent, inactive queue or wrong schedule.",
        "inspect": "Kibana: check queue entry, agent state and the offer. Compare with the queue configuration."
      },
      {
        "name": "Agent connection",
        "description": "The platform connects the customer to the agent. In persistent mode, the offhook agent leg is already open.",
        "example": "The agent’s standing connection is joined to this customer.",
        "proof": "The customer reaches the intended agent.",
        "failure": "Disconnected agent leg, wrong phone destination or missed offer.",
        "inspect": "Hoof: inspect the agent leg. Kibana: match the offer to the correct agent session."
      },
      {
        "name": "Conversation",
        "description": "Audio must travel in both directions. Call setup and audio are separate checks.",
        "example": "The customer and agent hear each other.",
        "proof": "Both sides can speak and listen.",
        "failure": "Wrong audio device, one-way media or poor network quality.",
        "inspect": "Check headset and mute first. In Hoof, compare media in each direction; check session changes in Kibana."
      }
    ]
  },
  "outbound": {
    "scope": "Manual outbound example",
    "title": "An agent calls a customer",
    "description": "This example starts with an agent clicking Dial. Automated campaigns can start calls differently.",
    "steps": [
      {
        "name": "Agent dials",
        "description": "The agent chooses a customer number and starts the call.",
        "example": "The agent returns a support call.",
        "proof": "The app sends a call request for the intended number.",
        "failure": "Expired session or an app error before the request is sent.",
        "inspect": "Kibana: find the call request. If absent, check the app’s network errors and your log coverage."
      },
      {
        "name": "Permission check",
        "description": "The platform checks outbound access and the applicable calling rules.",
        "example": "The agent uses an allowed caller ID.",
        "proof": "The request is accepted.",
        "failure": "Missing access, invalid number or a dialing restriction.",
        "inspect": "Kibana: read the application response. Check the agent’s access, number format and caller ID."
      },
      {
        "name": "External route",
        "description": "The platform creates a customer call leg and sends it through a carrier.",
        "example": "The customer’s mobile network receives the call attempt.",
        "proof": "The selected route returns call progress.",
        "failure": "Rejected request, route failure or timeout.",
        "inspect": "Hoof: follow the INVITE. Record the first rejection, its sender and the destination."
      },
      {
        "name": "Customer answers",
        "description": "The customer answers and the platform joins the customer and agent connections.",
        "example": "The customer picks up; the agent begins speaking.",
        "proof": "The correct leg is answered and acknowledged.",
        "failure": "Busy, no answer or a failed agent connection.",
        "inspect": "Hoof: distinguish ringing from answer. Check both the customer leg and agent leg."
      },
      {
        "name": "End & wrap-up",
        "description": "The customer leg ends. In persistent mode, the agent line can remain open while the agent finishes notes.",
        "example": "The agent selects a call result before becoming available again.",
        "proof": "The customer call ends and the agent’s state is appropriate.",
        "failure": "Unexpected hangup, unfinished wrap-up or a stale state.",
        "inspect": "Hoof: find who ended each leg. Kibana: check wrap-up and state changes. A remaining offhook leg can be normal."
      }
    ]
  },
  "user": {
    "scope": "Employee phone app",
    "title": "A user logs in",
    "description": "App access comes first. A working phone connection comes next.",
    "steps": [
      {
        "name": "Sign in",
        "description": "The employee signs in using the method enabled for the account. Company SSO may also require MFA.",
        "example": "The user completes the company sign-in screen.",
        "proof": "Identity verification succeeds.",
        "failure": "Wrong account, disabled user or failed sign-in challenge.",
        "inspect": "Check identity and application events in Kibana. If the page does not load, check DNS, network and browser errors."
      },
      {
        "name": "Open session",
        "description": "The app opens the user’s account and enabled features.",
        "example": "The expected account and extension appear.",
        "proof": "Authorized app requests succeed for the right user.",
        "failure": "Rejected session, wrong account or missing phone access.",
        "inspect": "Kibana: follow the sign-in result to the next app request. Read its error, not just its status code."
      },
      {
        "name": "Connect phone",
        "description": "The phone endpoint connects to the voice service. A SIP endpoint registers where it can be reached.",
        "example": "The WebPhone reports successful registration.",
        "proof": "The intended endpoint is ready.",
        "failure": "Failed connection, rejected registration or missed renewal.",
        "inspect": "Check app diagnostics. Use Hoof for registration if captured. One 401 followed by a successful retry can be normal."
      },
      {
        "name": "Check audio",
        "description": "Use an approved test call to verify the device and sound.",
        "example": "The selected headset works in both directions.",
        "proof": "The user can place or receive a call and hear it.",
        "failure": "Do Not Disturb, wrong headset or blocked microphone.",
        "inspect": "Check device settings first. Then follow the inbound or outbound flow to find the first failed step."
      }
    ]
  },
  "agent": {
    "scope": "RingCX / Engage Voice example",
    "title": "An agent gets ready for calls",
    "description": "Login, offhook and availability are different states. Follow the connection mode configured for the agent.",
    "steps": [
      {
        "name": "Sign in",
        "description": "The agent opens the correct portal and signs in.",
        "example": "The agent completes company SSO or the configured direct login.",
        "proof": "The product accepts the identity.",
        "failure": "Wrong portal, wrong login method or failed authentication.",
        "inspect": "Kibana: identify the first failed login request. Check the identity result and account."
      },
      {
        "name": "Agent access",
        "description": "The platform loads the agent’s account, phone settings and permitted queues or campaigns.",
        "example": "The agent has inbound access to Support.",
        "proof": "The correct agent and permissions are loaded.",
        "failure": "Wrong agent mapping or missing access.",
        "inspect": "Compare the user, agent and account IDs. Check phone destination and queue permissions."
      },
      {
        "name": "Agent session",
        "description": "The agent interface starts a session and reports a state.",
        "example": "The agent is signed in but still unavailable.",
        "proof": "A current session and state are recorded.",
        "failure": "Session failure, disconnected client or stale state.",
        "inspect": "Kibana: inspect session and state events. Compare the server record with the screen and collection time."
      },
      {
        "name": "Offhook",
        "description": "In persistent mode, the agent opens a voice connection to the platform. It can stay open between customer calls.",
        "example": "The agent answers the connection on the configured phone. No customer is on the line yet.",
        "proof": "The intended agent leg connects. Audio still needs a separate check.",
        "failure": "Wrong destination, no answer, failed softphone connection or a dropped agent leg.",
        "inspect": "Kibana: find the offhook attempt and result. Hoof: inspect the agent leg, including a wider time range than the customer call."
      },
      {
        "name": "Available",
        "description": "The agent selects the appropriate available state and must also be eligible for the target queue.",
        "example": "An offhook, available Support agent receives a Support offer.",
        "proof": "A waiting call is offered to an eligible agent.",
        "failure": "Unavailable state, unfinished wrap-up or no queue access.",
        "inspect": "Kibana: check state, queue eligibility and offers. Offhook alone does not make an agent available."
      }
    ]
  }
};

  const incidents = {
  "offhook": {
    "area": "Agent voice connection",
    "title": "The agent cannot connect offhook",
    "flow": "agent",
    "index": 3,
    "boundary": "The app is open, but the agent’s standing voice connection does not start.",
    "kibana": "Find the offhook request and result. Check agent session, phone destination and connection mode.",
    "sip3": "Find the agent leg. Did it ring, answer or return a rejection? Check softphone connection errors if no leg appears.",
    "check": "An app login does not prove a voice connection. In per-call mode, a standing offhook connection may not be expected."
  },
  "login": {
    "area": "Identity / app",
    "title": "The user cannot sign in",
    "flow": "user",
    "index": 0,
    "boundary": "Find whether the failure happens before sign-in, during identity verification or after it.",
    "kibana": "Check the identity result and first failed app request. Read the response details.",
    "sip3": "Usually start elsewhere. There may be no SIP traffic before the app opens.",
    "check": "Do not treat an HTTP login error as a SIP registration problem."
  },
  "agent": {
    "area": "Availability / queue",
    "title": "Offhook, but no customer calls arrive",
    "flow": "agent",
    "index": 4,
    "boundary": "The phone connection is up. Now check whether the queue is offering calls.",
    "kibana": "Check available state, unfinished wrap-up, queue access, schedule and call offers.",
    "sip3": "If an offer exists, inspect its delivery on the agent leg. If there is no offer, start with routing.",
    "check": "Offhook does not mean available. A connected agent can still be on break or doing after-call work."
  },
  "entry": {
    "area": "Number / carrier",
    "title": "The caller never reaches the menu",
    "flow": "inbound",
    "index": 0,
    "boundary": "First confirm whether the call reaches the observed platform entry.",
    "kibana": "Check the number’s destination, schedule and any routing error.",
    "sip3": "Find the incoming INVITE and first rejection or missing response. Compare a working call.",
    "check": "No trace is not proof of carrier failure. Check capture coverage and the time range first."
  },
  "ivr": {
    "area": "Menu / input",
    "title": "The menu plays, but the choice fails",
    "flow": "inbound",
    "index": 1,
    "boundary": "Separate a missing keypad digit from a bad routing decision.",
    "kibana": "Find the collected input, chosen branch and any failed backend lookup.",
    "sip3": "Inspect the IVR leg and digit events where captured. Not every capture contains keypad events.",
    "check": "A prompt playing does not prove the platform received the caller’s digit."
  },
  "outbound": {
    "area": "Calling policy / route",
    "title": "The outbound call never rings",
    "flow": "outbound",
    "index": 2,
    "boundary": "Confirm that the app accepted the request and created a customer leg.",
    "kibana": "Check outbound access, number format, caller ID and the call-start error.",
    "sip3": "Follow the INVITE. Record the rejection, emitting hop and timing.",
    "check": "A 403 says the request was refused. It does not identify the cause by itself."
  },
  "audio": {
    "area": "Audio / endpoint",
    "title": "One person cannot hear the other",
    "flow": "inbound",
    "index": 4,
    "boundary": "Name the missing direction: customer-to-agent or agent-to-customer.",
    "kibana": "Check session changes, device errors and reconnections at that time.",
    "sip3": "Compare both call legs and media directions. Find where expected audio packets stop being observed.",
    "check": "Silence alone does not prove a firewall fault. Check microphone, speaker, headset and mute."
  },
  "quality": {
    "area": "Media quality",
    "title": "Speech is choppy or delayed",
    "flow": "inbound",
    "index": 4,
    "boundary": "Find the affected direction and exact interval.",
    "kibana": "Look for client reconnects and device errors. Compare users and sites.",
    "sip3": "Inspect available packet loss, jitter and quality reports. Compare a successful call.",
    "check": "A low quality score is not a diagnosis. Check Wi-Fi, congestion, device load and headset."
  },
  "drop": {
    "area": "Call ending / connection",
    "title": "A call ends unexpectedly",
    "flow": "outbound",
    "index": 4,
    "boundary": "Check which leg ended: customer, agent or both.",
    "kibana": "Inspect logout, session loss, state changes and application errors.",
    "sip3": "Find BYE and its sender, or a timeout. Check the events immediately before it.",
    "check": "A customer hangup with the persistent agent leg still connected can be normal."
  },
  "missing": {
    "area": "Search / capture",
    "title": "The call is missing from Hoof",
    "flow": "inbound",
    "index": 0,
    "boundary": "Check the search before deciding the call never happened.",
    "kibana": "Find the interaction time and mapping to SIP Call-IDs. Confirm that a call leg was created.",
    "sip3": "Check timezone, filters, retention, sensor health and capture location. An offhook leg may have started much earlier.",
    "check": "An application interaction ID is not automatically a SIP Call-ID."
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
    byId('flow-steps').style.setProperty('--flow-count', flow.steps.length);
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

  const offhookStages = [
    { line: false, customer: false, state: 'Unavailable', story: 'The agent signs in. The application session works, but the agent voice connection has not started.' },
    { line: true, customer: false, state: 'Unavailable', story: 'The agent connects to the platform. With a phone destination, the agent answers that connection. No customer has joined.' },
    { line: true, customer: false, state: 'Available', story: 'The agent is connected and available. The queue can offer a call when its access and routing rules also match.' },
    { line: true, customer: true, state: 'On a call', story: 'A customer leg joins the agent leg through the platform. Both connections carry this conversation.' },
    { line: true, customer: false, state: 'Wrap-up', story: 'The customer leg ends. The persistent agent leg stays open. The agent finishes after-call work before becoming available again.' },
    { line: false, customer: false, state: 'Unavailable', story: 'In this example, the agent becomes unavailable and disconnects offhook. The app session remains signed in.' }
  ];
  function renderOffhook(index) {
    const stage = offhookStages[index];
    byId('offhook-controls').querySelectorAll('button').forEach((button, position) => {
      button.setAttribute('aria-pressed', String(position === index));
    });
    byId('agent-link').classList.toggle('connected', stage.line);
    byId('customer-link').classList.toggle('connected', stage.customer);
    text('agent-link-label', stage.line ? 'Agent leg connected' : 'Agent leg disconnected');
    text('customer-link-label', stage.customer ? 'Customer leg connected' : 'No customer leg');
    text('offhook-line', stage.line ? 'Connected' : 'Disconnected');
    text('offhook-state', stage.state);
    text('offhook-story', stage.story);
  }
  byId('offhook-controls').addEventListener('click', event => {
    const button = event.target.closest('button[data-stage]');
    if (button) renderOffhook(Number(button.dataset.stage));
  });
  renderOffhook(1);

  renderFlow(activeFlow);
  renderIncident();
})();
