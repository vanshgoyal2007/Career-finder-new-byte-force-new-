import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
const frontendOrigin = process.env.CAREERPILOT_FRONTEND_URL?.trim();
const allowedOrigins = new Set(
  [
    frontendOrigin,
    "http://localhost:4173",
    "http://127.0.0.1:4173",
  ].filter((origin): origin is string => Boolean(origin)),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      const isLocalDevelopmentOrigin =
        process.env.NODE_ENV !== "production" &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
      callback(null, allowedOrigins.has(origin) || isLocalDevelopmentOrigin);
    },
  }),
);
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
