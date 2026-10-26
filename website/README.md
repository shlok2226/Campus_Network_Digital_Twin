# Campus Packet Lab

A dark, interactive frontend and Python backend that models the supplied `Group_project.pkt` topology. Select two endpoints, choose ICMP/TCP/UDP, and watch the simulated packet move through SW1 and R1. The inspector shows the VLAN at each hop, interface, packet addresses, destination port, and TTL changes.

The header includes a download link for the completed Packet Tracer file so the modeled topology can be opened in Cisco Packet Tracer.

The site models the Packet Tracer lab; it does not control or emulate the Cisco Packet Tracer application itself. Its current network model mirrors the saved campus design: router-on-a-stick, switch SW1, four department VLANs, eight DHCP clients, and the school HTTP/DNS server.

## Run on Windows

From this folder, run:

```powershell
python server.py
```

Open [http://127.0.0.1:8090](http://127.0.0.1:8090). Python 3.10+ is required; the backend uses only the standard library. Set `PORT` to change the port.

## Run with Docker

```sh
docker build -t campus-packet-lab .
docker run --rm -p 8090:8090 campus-packet-lab
```

## API

- `GET /health` — liveness check
- `GET /api/topology` — devices, links, VLANs, and modeled services
- `POST /api/trace` — trace one simulated packet
- `GET /api/traces` — most recent 25 in-memory traces

Example request:

```json
{
  "source": "A1",
  "destination": "SERVER",
  "protocol": "TCP",
  "destinationPort": 80
}
```

Quick flows in the UI demonstrate an HTTP request to the portal server, an inter-VLAN ICMP packet, and a UDP DNS request. Traces are simulations against the lab model and are not sent over a physical or Packet Tracer network.
