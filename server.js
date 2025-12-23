import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

// Rotas
import imoveisRoutes from "./routes/imoveis.js";
import climateRoutes from "./routes/climate.js";
import excelWithImagesRoutes from "./routes/excelWithImages.js";

dotenv.config();
const app = express();

/* ===============================
   CORS (OK PARA RENDER + DOWNLOAD)
================================ */
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Disposition"],
  })
);

/* ===============================
   CONFIGURAÇÕES BÁSICAS
================================ */
app.use(express.json());

/* ===============================
   PASTA PÚBLICA (UPLOADS)
================================ */
app.use("/uploads", express.static(path.join(path.resolve(), "uploads")));

/* ===============================
   ROTAS DO SISTEMA
================================ */
app.use("/api/imoveis", imoveisRoutes);
app.use("/api/climate", climateRoutes);
app.use("/api/excel", excelWithImagesRoutes);

/* ===============================
   ROTAS PING / HEALTH (UPTIMEROBOT)
   ⚠️ NÃO PROTEGER COM TOKEN
================================ */
app.get("/", (req, res) => {
  res.status(200).json({
    status: true,
    message: "Servidor online e funcionando",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    memory: process.memoryUsage().rss,
    timestamp: new Date().toISOString(),
  });
});

/* ===============================
   CONEXÃO MONGODB
================================ */
const MONGO =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/mernbelm";

mongoose
  .connect(MONGO)
  .then(() => console.log("✅ MongoDB conectado"))
  .catch((err) =>
    console.log("❌ Erro MongoDB:", err.message)
  );

/* ===============================
   START SERVER
================================ */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
