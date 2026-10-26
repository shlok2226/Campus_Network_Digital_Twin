# Campus Packet Lab

Campus Packet Lab is a campus network project built with Cisco Packet Tracer and a companion dark-theme website. The network separates Administration, Teachers, Students, and Library into four VLANs. The website visualizes packet paths through the design for demonstrations.

> Website traces are simulations from the project's network model. They do not control Cisco Packet Tracer or represent live network traffic.

## View the documents in your browser

- [Presentation preview (PDF)](output/pdf/Campus_Packet_Lab_Presentation_Preview.pdf)
- [Project report preview (PDF)](output/pdf/Campus_Packet_Lab_Report_Preview.pdf)

GitHub previews PDF files in the browser. The original PPTX, DOCX, MP4, and PKT files are provided as downloads; open the PKT file with Cisco Packet Tracer.

## Project files

- [`packet-tracer/Group_project_completed.pkt`](packet-tracer/Group_project_completed.pkt) — completed network to open in Cisco Packet Tracer 9.x.
- [`website/`](website/) — responsive frontend and Python API/backend.
- [`presentation/`](presentation/) — project presentation with the repository link on its cover slide.
- [`report/`](report/) — project report with the MIT-WPU logo and network details.
- [`video/Campus-Network-Demo.mp4`](video/Campus-Network-Demo.mp4) — project demonstration video.
- [`packet-tracer-server-portal/index.html`](packet-tracer-server-portal/index.html) — static Campus Connect page served by the Packet Tracer Server-PT.

## Network design

| VLAN | Department | Network | Gateway |
| --- | --- | --- | --- |
| 10 | Administration | `192.168.10.0/24` | `192.168.10.1` |
| 20 | Teachers | `192.168.20.0/24` | `192.168.20.1` |
| 30 | Students | `192.168.30.0/24` | `192.168.30.1` |
| 40 | Library | `192.168.40.0/24` | `192.168.40.1` |

R1 (Cisco 2911) routes between VLANs over an 802.1Q trunk to SW1 (Cisco 2960). R1 provides DHCP. The Server-PT at `192.168.40.10` provides HTTP and DNS; `www.school.com` and `www.school.local` resolve to that address.

## Run the website locally

Requirements: Python 3.10 or later. The backend uses only the Python standard library.

```powershell
cd website
python server.py
```

Open [http://127.0.0.1:8090/](http://127.0.0.1:8090/) on the same computer. Keep the server process running while using the site.

The API includes `GET /health`, `GET /api/topology`, `POST /api/trace`, and `GET /api/traces`. Trace history is held in memory and resets when the server stops.

## Verify the Packet Tracer network

Open `packet-tracer/Group_project_completed.pkt` in Cisco Packet Tracer. The accompanying [Packet Tracer notes](packet-tracer/README.md) describe the topology, address plan, and suggested DHCP, ping, DNS, HTTP, and CLI checks. Run those checks in Packet Tracer before presenting live network results.
