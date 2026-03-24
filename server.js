import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

// ROTAS
import authRoutes from "./routes/auth.js";
import imoveisRoutes from "./routes/imoveis.js";
import climateRoutes from "./routes/climate.js";
import excelWithImagesRoutes from "./routes/excelWithImages.js";

dotenv.config();

const app = express();

/* ===============================
   🔐 MIDDLEWARES
================================ */

// CORS
app.use(
  cors({
    origin: "*", // ⚠️ troque pelo domínio em produção
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Disposition"],
  })
);

// JSON
app.use(express.json());

/* ===============================
   📂 ARQUIVOS ESTÁTICOS
================================ */
app.use("/uploads", express.static(path.join(path.resolve(), "uploads")));

/* ===============================
   🧪 LOG DE ROTAS (DEBUG)
================================ */
console.log("🔥 Servidor iniciando...");
console.log("📦 Carregando rotas...");

/* ===============================
   🌐 ROTAS DA API
================================ */
app.use("/api/auth", authRoutes);
app.use("/api/imoveis", imoveisRoutes);
app.use("/api/climate", climateRoutes);
app.use("/api/excel", excelWithImagesRoutes);

/* ===============================
   ❤️ HEALTH CHECK
================================ */
app.get("/", (req, res) => {
  res.status(200).json({
    status: true,
    message: "Servidor online 🚀",
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
   ❌ ROTA NÃO ENCONTRADA (ANTI HTML ERROR)
================================ */
app.use((req, res) => {
  res.status(404).json({
    message: "Rota não encontrada",
    path: req.originalUrl,
  });
});

/* ===============================
   ⚠️ ERRO GLOBAL
================================ */
app.use((err, req, res, next) => {
  console.error("❌ [ERRO GLOBAL]:", err);

  res.status(err.status || 500).json({
    message: err.message || "Erro interno do servidor",
  });
});

/* ===============================
   🚀 CONEXÃO MONGODB
================================ */
const PORT = process.env.PORT || 5000;
const MONGO =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/mernbelm";

mongoose
  .connect(MONGO)
  .then(() => {
    console.log("✅ MongoDB conectado");

    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Erro ao conectar no MongoDB:", err.message);
    process.exit(1);
  });