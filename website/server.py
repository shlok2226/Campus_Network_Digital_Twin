"""Backend API and static server for the Campus Packet Lab site."""

from __future__ import annotations

from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import threading
import uuid


ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8090"))
TRACE_LOCK = threading.Lock()
TRACES: list[dict] = []


VLAN_INFO = {
    10: {"name": "Administration", "network": "192.168.10.0/24", "gateway": "192.168.10.1"},
    20: {"name": "Teachers", "network": "192.168.20.0/24", "gateway": "192.168.20.1"},
    30: {"name": "Students", "network": "192.168.30.0/24", "gateway": "192.168.30.1"},
    40: {"name": "Library & Services", "network": "192.168.40.0/24", "gateway": "192.168.40.1"},
}


def _host(node_id: str, name: str, vlan: int, ip: str, role: str, x: int, y: int) -> dict:
    return {
        "id": node_id,
        "name": name,
        "role": role,
        "vlan": vlan,
        "ip": ip,
        "gateway": VLAN_INFO[vlan]["gateway"],
        "network": VLAN_INFO[vlan]["network"],
        "x": x,
        "y": y,
    }


NODES = [
    {"id": "R1", "name": "R1", "role": "Router · 2911", "ip": "192.168.10.1", "x": 500, "y": 62},
    {"id": "SW1", "name": "SW1", "role": "Switch · 2960", "ip": "Layer 2", "x": 500, "y": 205},
    _host("A1", "A1", 10, "192.168.10.11", "Admin PC", 105, 410),
    _host("A2", "A2", 10, "192.168.10.12", "Admin PC", 220, 410),
    _host("T1", "T1", 20, "192.168.20.11", "Teacher PC", 325, 410),
    _host("T2", "T2", 20, "192.168.20.12", "Teacher PC", 440, 410),
    _host("S1", "S1", 30, "192.168.30.11", "Student PC", 555, 410),
    _host("S2", "S2", 30, "192.168.30.12", "Student PC", 670, 410),
    _host("L1", "L1", 40, "192.168.40.11", "Library PC", 775, 410),
    _host("L2", "L2", 40, "192.168.40.12", "Library PC", 890, 410),
    _host("SERVER", "school-server", 40, "192.168.40.10", "HTTP · DNS", 850, 510),
]

NODE_BY_ID = {node["id"]: node for node in NODES}
CLIENT_IDS = [node["id"] for node in NODES if node["id"] not in {"R1", "SW1"}]


def _link(source: str, target: str, kind: str, vlan: int | None = None, port: str = "") -> dict:
    return {"source": source, "target": target, "kind": kind, "vlan": vlan, "port": port}


LINKS = [
    _link("R1", "SW1", "trunk", port="Gi0/0 ↔ Fa0/1"),
    _link("SW1", "A1", "access", 10, "Fa0/2"),
    _link("SW1", "A2", "access", 10, "Fa0/3"),
    _link("SW1", "T1", "access", 20, "Fa0/4"),
    _link("SW1", "T2", "access", 20, "Fa0/5"),
    _link("SW1", "S1", "access", 30, "Fa0/6"),
    _link("SW1", "S2", "access", 30, "Fa0/7"),
    _link("SW1", "L1", "access", 40, "Fa0/8"),
    _link("SW1", "L2", "access", 40, "Fa0/9"),
    _link("SW1", "SERVER", "server", 40, "Fa0/10"),
]


def topology() -> dict:
    return {
        "name": "Campus Packet Lab",
        "devices": NODES,
        "links": LINKS,
        "vlans": [{"id": number, **values} for number, values in VLAN_INFO.items()],
        "services": [
            {"name": "DHCP", "device": "R1", "state": "online"},
            {"name": "Inter-VLAN routing", "device": "R1", "state": "online"},
            {"name": "HTTP", "device": "SERVER", "state": "online"},
            {"name": "DNS", "device": "SERVER", "state": "online"},
        ],
    }


def trace_packet(payload: object) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("Request must be a JSON object")

    source_id = payload.get("source")
    destination_id = payload.get("destination")
    protocol = payload.get("protocol", "ICMP")
    if source_id not in CLIENT_IDS:
        raise ValueError("Choose a valid source endpoint")
    if destination_id not in CLIENT_IDS:
        raise ValueError("Choose a valid destination endpoint")
    if source_id == destination_id:
        raise ValueError("Source and destination must be different")
    if protocol not in ("ICMP", "TCP", "UDP"):
        raise ValueError("Protocol must be ICMP, TCP, or UDP")

    source = NODE_BY_ID[source_id]
    destination = NODE_BY_ID[destination_id]
    source_vlan = source["vlan"]
    destination_vlan = destination["vlan"]
    destination_name = destination["name"]
    destination_network = destination["network"]
    destination_access_port = next(link["port"] for link in LINKS if link["target"] == destination_id)
    routed = source_vlan != destination_vlan

    default_ports = {"TCP": 80, "UDP": 53}
    raw_port = payload.get("destinationPort", default_ports.get(protocol))
    destination_port = None
    if protocol != "ICMP":
        try:
            destination_port = int(raw_port)
        except (TypeError, ValueError) as error:
            raise ValueError("Enter a destination port from 1 to 65535") from error
        if not 1 <= destination_port <= 65535:
            raise ValueError("Destination port must be from 1 to 65535")

    if routed:
        path = [source_id, "SW1", "R1", "SW1", destination_id]
        hops = [
            {
                "nodeId": "SW1", "name": "SW1", "role": "Access switch", "ip": "Layer 2",
                "vlan": source_vlan, "event": "Access → trunk",
                "detail": f"Receives the frame on VLAN {source_vlan}, then adds an 802.1Q VLAN {source_vlan} tag toward R1.",
                "interface": "Fa0/1 trunk", "ttl": 64,
            },
            {
                "nodeId": "R1", "name": "R1", "role": "Router · 2911", "ip": VLAN_INFO[source_vlan]["gateway"],
                "vlan": source_vlan, "event": "Route between VLANs",
                "detail": f"Receives on Gi0/0.{source_vlan}, routes to {destination_network} via Gi0/0.{destination_vlan}, decrements TTL, and retags for VLAN {destination_vlan}.",
                "interface": f"Gi0/0.{source_vlan} → Gi0/0.{destination_vlan}", "ttl": 63,
            },
            {
                "nodeId": "SW1", "name": "SW1", "role": "Access switch", "ip": "Layer 2",
                "vlan": destination_vlan, "event": "Trunk → access",
                "detail": f"Reads the VLAN {destination_vlan} tag and forwards the frame to {destination_name} on {destination_access_port}.",
                "interface": "Fa0/1 trunk", "ttl": 63,
            },
        ]
    else:
        path = [source_id, "SW1", destination_id]
        hops = [
            {
                "nodeId": "SW1", "name": "SW1", "role": "Access switch", "ip": "Layer 2",
                "vlan": source_vlan, "event": "Local VLAN forwarding",
                "detail": f"Learns the destination MAC and forwards within VLAN {source_vlan}; the router is not used.",
                "interface": destination_access_port, "ttl": 64,
            },
        ]

    hops.append({
        "nodeId": destination_id,
        "name": destination["name"],
        "role": destination["role"],
        "ip": destination["ip"],
        "vlan": destination_vlan,
        "event": "Packet delivered",
        "detail": f"{protocol} packet reached {destination_name} at {destination['ip']}.",
        "interface": "FastEthernet0",
        "ttl": 63 if routed else 64,
    })

    trace = {
        "id": uuid.uuid4().hex[:10],
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "status": "delivered",
        "protocol": protocol,
        "source": {"id": source_id, "name": source["name"], "ip": source["ip"], "vlan": source_vlan},
        "destination": {"id": destination_id, "name": destination["name"], "ip": destination["ip"], "vlan": destination_vlan},
        "packet": {
            "sourceIp": source["ip"],
            "destinationIp": destination["ip"],
            "sourcePort": 49152 if protocol != "ICMP" else None,
            "destinationPort": destination_port,
            "ttlStart": 64,
            "ttlEnd": 63 if routed else 64,
            "vlanEntry": source_vlan,
            "vlanExit": destination_vlan,
        },
        "path": path,
        "hops": hops,
        "summary": f"{protocol} delivered from {source_id} to {destination_id} across {len(hops)} network hops.",
    }
    with TRACE_LOCK:
        TRACES.insert(0, trace)
        del TRACES[25:]
    return trace


class RequestHandler(BaseHTTPRequestHandler):
    server_version = "CampusPacketLab/1.0"

    def do_GET(self):  # noqa: N802
        if self.path == "/health":
            self._send(200, b"ok", "text/plain; charset=utf-8")
        elif self.path == "/api/topology":
            self._send_json(200, topology())
        elif self.path == "/api/traces":
            with TRACE_LOCK:
                self._send_json(200, {"traces": TRACES.copy()})
        else:
            self._serve_static(self.path)

    def do_POST(self):  # noqa: N802
        if self.path != "/api/trace":
            self._send_json(404, {"error": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 1 <= length <= 4096:
                raise ValueError("Request body must be between 1 and 4096 bytes")
            payload = json.loads(self.rfile.read(length))
            trace = trace_packet(payload)
        except (ValueError, json.JSONDecodeError) as error:
            self._send_json(400, {"error": str(error)})
            return
        self._send_json(200, trace)

    def _serve_static(self, request_path: str):
        relative = "index.html" if request_path in {"", "/"} else request_path.lstrip("/")
        candidate = (STATIC / relative).resolve()
        if not candidate.is_relative_to(STATIC.resolve()) or not candidate.is_file():
            self._send(404, b"Not found", "text/plain; charset=utf-8")
            return
        content_type = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
        }.get(candidate.suffix, "application/octet-stream")
        self._send(200, candidate.read_bytes(), content_type)

    def _send_json(self, status: int, payload: dict):
        self._send(status, json.dumps(payload).encode("utf-8"), "application/json; charset=utf-8")

    def _send(self, status: int, data: bytes, content_type: str):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        print(f"{self.client_address[0]} - {fmt % args}")


def main():
    server = ThreadingHTTPServer((HOST, PORT), RequestHandler)
    print(f"Campus Packet Lab listening at http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
