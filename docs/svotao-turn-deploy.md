# Svotao TURN Deploy

Use `caprover-coturn-template.yml` from CapRover's One-Click Apps `TEMPLATE`
screen.

## Values

- Public VPS IP: the public IPv4 address of the CapRover VPS.
- TURN Realm: a domain that points to the VPS, for example `p2p-api.vps.notifyapp.it`.
- TURN Username: `svotao`.
- TURN Password: a long random password.

## VPS Firewall

Open these ports on the VPS/provider firewall:

```text
3478 TCP
3478 UDP
49160-49170 TCP
49160-49170 UDP
```

WebRTC relay candidates may use UDP even when the client connects to TURN over
TCP, so both the TURN listener and relay range must be open for UDP.

## svotao-share-api Environment

After Coturn is deployed, set these env vars on the existing `svotao-share-api`
CapRover app:

```env
TURN_URLS=turn:p2p-turn.vps.notifyapp.it:3478?transport=tcp
TURN_USERNAME=svotao
TURN_CREDENTIAL=<same password used in the TURN template>
```

Restart or redeploy `svotao-share-api` after changing the env vars.
