# Group Project — completed Packet Tracer network

Open `Group_project_completed.pkt` in Cisco Packet Tracer 9.x. The original in Downloads is unchanged.

## What is configured

- Router `R1` routes the four department VLANs through 802.1Q subinterfaces on `GigabitEthernet0/0`. The parent interface is enabled.
- Switch `SW1` has VLANs 10 (ADMIN), 20 (TEACHERS), 30 (STUDENTS), and 40 (LIBRARY). Its first port is the router trunk; the attached PCs and server remain on their department access ports.
- R1 provides DHCP and default gateways for all four /24 networks. The statically addressed server `192.168.40.10` is excluded from the DHCP pool.
- The server at `192.168.40.10` has HTTP and DNS enabled. Its embedded HTTP page is the dark Campus Connect portal in `frontend/index.html`, including a diagram of this Packet Tracer topology.
- DNS resolves `www.school.com` and `www.school.local` to `192.168.40.10`; a misspelled `www.shool.local` record was corrected.

## Address plan

| VLAN | Department | Network | Default gateway | DHCP DNS |
| --- | --- | --- | --- | --- |
| 10 | Administration | `192.168.10.0/24` | `192.168.10.1` | `192.168.40.10` |
| 20 | Teachers | `192.168.20.0/24` | `192.168.20.1` | `192.168.40.10` |
| 30 | Students | `192.168.30.0/24` | `192.168.30.1` | `192.168.40.10` |
| 40 | Library | `192.168.40.0/24` | `192.168.40.1` | `192.168.40.10` |

## Verify in Packet Tracer

1. Open the file in Realtime mode and wait for the links to turn green.
2. On each PC, open **Desktop → IP Configuration** and select **DHCP**. Confirm the address belongs to the PC's VLAN, the gateway ends in `.1`, and DNS is `192.168.40.10`.
3. From a PC, open **Desktop → Command Prompt** and run `ipconfig`, `ping 192.168.40.10`, and `ping` to that PC's gateway from the table above.
4. Open **Desktop → Web Browser** and visit `http://www.school.com` or `http://192.168.40.10`. The Campus Connect page should load.
5. On R1, check `show ip interface brief`, `show ip dhcp binding`, and `show ip route`. On SW1, check `show vlan brief` and `show interfaces trunk`.
6. On the server, open **Services → HTTP** and **Services → DNS** to confirm each service is On and that both website records point to `192.168.40.10`.

## Frontend and backend scope

The frontend is a responsive, static campus portal. Packet Tracer's Server-PT serves the HTML page over HTTP; its DNS service maps the campus names to the server. R1 and SW1 provide the network backend through VLAN routing, DHCP, and switching. Packet Tracer Server-PT is not a general-purpose application host, so this lab does not include a database or a dynamic application API.
