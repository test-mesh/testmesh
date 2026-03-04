"""
TestMesh Plugin SDK for Python

This SDK provides a simple way to create TestMesh plugins using Python.
Plugins communicate with TestMesh via HTTP.
"""

import json
import os
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Callable, Dict, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class PluginContext:
    """Context passed to action handlers"""
    execution_id: str = ""
    flow_id: str = ""
    step_id: str = ""
    variables: Dict[str, str] = field(default_factory=dict)
    step_outputs: Dict[str, Dict[str, Any]] = field(default_factory=dict)


@dataclass
class LogEntry:
    """A log entry from plugin execution"""
    level: str
    message: str
    timestamp: datetime = field(default_factory=datetime.now)

    def to_dict(self):
        return {
            "level": self.level,
            "message": self.message,
            "timestamp": self.timestamp.isoformat()
        }


class Logger:
    """Logger that captures logs for the response"""

    def __init__(self):
        self.logs: list[LogEntry] = []

    def debug(self, msg: str):
        self.logs.append(LogEntry("debug", msg))

    def info(self, msg: str):
        self.logs.append(LogEntry("info", msg))

    def warn(self, msg: str):
        self.logs.append(LogEntry("warn", msg))

    def error(self, msg: str):
        self.logs.append(LogEntry("error", msg))


class TestMeshPlugin:
    """Main plugin class for creating TestMesh plugins"""

    def __init__(self, manifest: Dict[str, Any]):
        self.manifest = manifest
        self.handlers: Dict[str, Callable] = {}
        self.port = int(os.environ.get("PLUGIN_PORT", "0"))
        self.start_time = time.time()
        self.server: Optional[HTTPServer] = None

    def action(self, action_id: str):
        """Decorator to register an action handler"""
        def decorator(func: Callable):
            self.handlers[action_id] = func
            return func
        return decorator

    def start(self):
        """Start the plugin HTTP server"""
        plugin = self

        class PluginHandler(BaseHTTPRequestHandler):
            def log_message(self, format, *args):
                pass  # Suppress default logging

            def send_json(self, data: dict, status: int = 200):
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(data).encode())

            def do_GET(self):
                if self.path == "/health":
                    self.send_json({
                        "status": "healthy",
                        "version": plugin.manifest.get("version", "1.0.0"),
                        "uptime_seconds": int(time.time() - plugin.start_time)
                    })
                elif self.path == "/info":
                    self.send_json({
                        "id": plugin.manifest["id"],
                        "name": plugin.manifest["name"],
                        "version": plugin.manifest.get("version", "1.0.0"),
                        "description": plugin.manifest.get("description", ""),
                        "actions": [
                            {"id": aid, "name": aid, "description": f"Action: {aid}"}
                            for aid in plugin.handlers.keys()
                        ]
                    })
                else:
                    self.send_json({"error": "Not found"}, 404)

            def do_POST(self):
                if self.path == "/execute":
                    content_length = int(self.headers.get("Content-Length", 0))
                    body = self.rfile.read(content_length).decode()
                    request = json.loads(body)

                    action = request.get("action")
                    config = request.get("config", {})
                    ctx_data = request.get("context", {})

                    context = PluginContext(
                        execution_id=ctx_data.get("execution_id", ""),
                        flow_id=ctx_data.get("flow_id", ""),
                        step_id=ctx_data.get("step_id", ""),
                        variables=ctx_data.get("variables", {}),
                        step_outputs=ctx_data.get("step_outputs", {})
                    )

                    handler = plugin.handlers.get(action)
                    if not handler:
                        self.send_json({
                            "success": False,
                            "error": {
                                "code": "UNKNOWN_ACTION",
                                "message": f"Unknown action: {action}"
                            }
                        })
                        return

                    start_time = time.time()
                    logger = Logger()

                    try:
                        result = handler(config, context, logger)
                        self.send_json({
                            "success": True,
                            "output": result or {},
                            "logs": [log.to_dict() for log in logger.logs],
                            "metrics": {
                                "duration_ms": int((time.time() - start_time) * 1000)
                            }
                        })
                    except Exception as e:
                        self.send_json({
                            "success": False,
                            "error": {
                                "code": getattr(e, "code", "EXECUTION_ERROR"),
                                "message": str(e)
                            },
                            "logs": [log.to_dict() for log in logger.logs],
                            "metrics": {
                                "duration_ms": int((time.time() - start_time) * 1000)
                            }
                        })

                elif self.path == "/shutdown":
                    self.send_json({"status": "shutting_down"})
                    # Schedule shutdown
                    import threading
                    threading.Timer(0.1, lambda: os._exit(0)).start()
                else:
                    self.send_json({"error": "Not found"}, 404)

        self.server = HTTPServer(("127.0.0.1", self.port), PluginHandler)
        actual_port = self.server.server_address[1]
        print(f"Plugin {self.manifest['id']} listening on port {actual_port}")
        self.server.serve_forever()
