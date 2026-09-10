# The Phone Company: editorial research

Reviewed September 10, 2026. This file supports maintenance of the guide. It is
not loaded or linked by the teaching page. Visible citations and the source
section were removed at the user's request.

## Offhook and state

- [Engage Voice for Zendesk](https://netstorage.ringcentral.com/datasheets/engage_voice_for_zendesk.pdf)
  documents a persistent voice connection to the agent's extension or chosen
  phone number, and separately describes availability for call routing.
- [Real-Time Supervisor View](https://developers.ringcentral.com/engage/voice/guide/analytics/reports/realtime-supervisor-view)
  exposes `isOffhook`, `agentState`, `agentLoginId`, active-call `callUii`,
  `pendingDisposition` and `lastUpdate` as distinct fields. The page presents
  the first five as fields to inspect when the deployment collects them, not
  as a universal Kibana schema. `lastUpdate` describes the last change; it does
  not by itself prove that a collector is current.
- [RingCX queues](https://developers.ringcentral.com/engage/voice/guide/routing/queues/queues)
  documents queue eligibility, `wrapTime` and acceptance timing for agents with
  offhook disabled. A disconnected standing leg is not necessarily a fault in
  per-call mode.
- [Engage Voice getting started](https://support.ringcentral.com/get-started/engage-voice.html)
  lists “Starting an offhook session.” Its linked tutorial could not be read;
  no detailed UI instructions were inferred from that link.

The six-stage demo is a teaching example of a persistent agent connection.
The agent is initially unavailable, then becomes available, handles a customer,
does wrap-up, and becomes unavailable before disconnecting the agent leg.
This is not a statement that every product automatically makes those state
transitions. The independent agent and customer legs are the key lesson.

## Functional architecture and flows

- [RingCentral unified communications reference architecture](https://support.ringcentral.com/sg/en/network-and-system-requirements/network-requirements/overview/ringcentral-unified-communications-reference-architecture.html)
  describes the RingEX session controller, media server, carrier interfaces and
  cloud API. It supports explaining those functions, not assigning private
  RingCX hostnames or service ownership.
- [RingCX agents](https://developers.ringcentral.com/engage/voice/guide/users/agents/agents)
  documents agent permissions, voice destinations and initial state.
- [Authentication variants](https://developers.ringcentral.com/engage/voice/guide/authentication)
  distinguishes linked RingCentral, direct Engage and legacy flows. The revised
  beginner journey omits the integration-specific token exchange from agent UI
  login; it is not a mandatory universal screen-login step.
- [RingCentral app guide](https://assets.ringcentral.com/us/guide/RingCentral_App_Getting_Started_Guide.pdf)
  and [WebPhone implementation](https://github.com/ringcentral/ringcentral-web-phone)
  support separating user sign-in from SIP endpoint registration.
- [RingCX outbound modes](https://www.ringcentral.com/ringcx/outbound.html)
  distinguishes manual, preview, progressive and predictive dialing.
- [Engage Voice IVR](https://netstorage.ringcentral.com/datasheets/engage_voice_ivr.pdf)
  describes prompts and caller interaction. [October 2022 release notes](https://support.ringcentral.com/gb/en/release-notes/customer-engagement/engage-voice/release-notes-october-2022.html)
  explicitly expand VRU as Voice Response Unit.

## Investigation references

- [SIP3 Advanced Search](https://sip3.io/docs/features/AdvancedSearch.html):
  `sip.call_id`, states and media search fields. Search results depend on capture.
- [SIP3 Call Flow](https://sip3.io/meet-sip3-2021-3-1/): leg and message analysis.
- [Elastic Discover](https://www.elastic.co/docs/explore-analyze/discover/discover-get-started)
  and [KQL](https://www.elastic.co/docs/explore-analyze/query-filter/languages/kql):
  data selection, time filtering and searches. Example identifiers are fictional.
- IETF [SIP](https://www.rfc-editor.org/rfc/rfc3261),
  [RTP/RTCP](https://www.rfc-editor.org/rfc/rfc3550),
  [SDP](https://www.rfc-editor.org/rfc/rfc8866),
  [SRTP](https://www.rfc-editor.org/rfc/rfc3711), and
  [SBC functions](https://www.rfc-editor.org/rfc/rfc5853) inform the simplified
  ladder, protocol definitions and response-code interpretation.

Troubleshooting paths are suggested investigations, not vendor error runbooks
or claims that particular logs exist. No real accounts, calls or credentials
were used to test the teaching page.

## Unresolved internal names

Repeated public searches did not verify EIQ or EID as RingCentral voice service
names. ECC appears in unrelated product contexts, including Enhanced Customer
Card and Emergency Call Centre. Neither establishes the meaning of an internal
ECC service. The guide does not invent expansions or place these labels in its
diagrams. Mapping them requires an approved service definition and trace.
