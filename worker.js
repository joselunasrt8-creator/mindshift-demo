import { handleRequest } from "./gateway.js";

export default {
  async fetch(request) {
    return handleRequest(request);
  }
};