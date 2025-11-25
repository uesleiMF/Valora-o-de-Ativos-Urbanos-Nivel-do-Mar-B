import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import excelWithImagesRoutes from "./routes/excelWithImages.js";
console.log(">> excelWithImagesRoutes carregado:", !!excelWithImagesRoutes);

// Rotas
import imoveisRoutes from "./routes/imoveis.js";
import climateRoutes from "./routes/climate.js";
import excelWithImagesRoutes from "./routes/excelWithImages.js";

dotenv.config();
const app = express();

// Configurações básicas
app.use(cors());
app.use(express.json());

// Pasta pública para imagens enviadas
app.use("/uploads", express.static(path.join(path.resolve(), "uploads")));

// Rotas principais do sistema
app.use("/api/imoveis", imoveisRoutes);       // CRUD dos imóveis
app.use("/api/climate", climateRoutes);       // Dados climáticos
app.use("/api/excel", excelWithImagesRoutes); // Gerar Excel com imagens

// Rota simples de teste
app.get("/", (req, res) => res.json({ status: "Servidor online" }));

// Conexão MongoDB
const MONGO = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/mernbelm";

mongoose
  .connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB conectado"))
  .catch((err) => console.log("❌ Erro MongoDB:", err.message));

// Inicialização do servidor
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Servidor rodando na porta ${PORT}`)
);
