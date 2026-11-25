import express from "express";
import { startBackendServer } from "../shared/backendServer.js";

startBackendServer(express, {
  id: "A",
  machineKey: "m4",
  owner: "Rishav Devan",
  defaultPort: 5001,
  portField: "backendA",
});
