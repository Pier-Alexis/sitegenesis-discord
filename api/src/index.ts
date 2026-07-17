import express from "express";
import dotenv from "dotenv";
import bansRouter from "./routes/bans";
import { requireApiKey } from "./middleware/auth";
import eventsRouter from "./routes/events";

dotenv.config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requireApiKey);
app.use("/api", bansRouter);
app.use("/api/events", eventsRouter);

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.json({
        status: "online",
        service: "SiteGenesis API"
    });
});

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        service: "SiteGenesis API"
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`API running on port ${PORT}`);
});
