import express from "express";
import { createServer } from "http";
import { registerRoutes } from "../server/routes.js";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: false }));
// 이미지 바이너리용 raw 파서
app.use(
  "/api/upload-image",
  express.raw({ type: "image/*", limit: "10mb" })
);

const ready = registerRoutes(httpServer, app);

export default async function handler(req: any, res: any) {
  await ready;
  app(req, res);
}
