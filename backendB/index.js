import express from "express";
import { startBackendServer } from "../shared/backendServer.js";

startBackendServer(express, {
  id: "B",
  machineKey: "m3",
  owner: "Soumen Dass",
  defaultPort: 5002,
  portField: "backendB",
});
