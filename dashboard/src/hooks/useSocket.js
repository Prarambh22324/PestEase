import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = process.env.REACT_APP_WS_URL || "http://localhost:5000";

export function useSocket(farmId) {
  const socketRef     = useRef(null);
  const [connected, setConnected]       = useState(false);
  const [roverPosition, setRoverPosition]   = useState(null);
  const [roverTelemetry, setRoverTelemetry] = useState(null);
  const [newAlert, setNewAlert]             = useState(null);
  const [sprayComplete, setSprayComplete]   = useState(null);

  useEffect(() => {
    if (!farmId) return;

    const socket = io(SOCKET_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect",    () => { setConnected(true);  socket.emit("join_farm", farmId); });
    socket.on("disconnect", () =>   setConnected(false));
    socket.on("rover_telemetry",  (d) => { setRoverPosition(d.location); setRoverTelemetry(d); });
    socket.on("new_alert",        (d) => setNewAlert(d));
    socket.on("spray_complete",   (d) => setSprayComplete(d));

    return () => { socket.disconnect(); };
  }, [farmId]);

  return { connected, roverPosition, roverTelemetry, newAlert, sprayComplete };
}
