import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import imoveisRoutes from "./routes/imoveis.js";
import climateRoutes from "./routes/climate.js";
import path from "path";

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(path.resolve(), "uploads")));

app.use("/api/imoveis", imoveisRoutes);
app.use("/api/climate", climateRoutes);

app.get("/", (req,res)=> res.json({status:"ok"}));

const MONGO = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/mernbelm";
mongoose.connect(MONGO, { useNewUrlParser:true, useUnifiedTopology:true })
  .then(()=>console.log("MongoDB conectado"))
  .catch(err=>console.log("MongoDB error:", err.message));

const PORT = process.env.PORT || 5000;
app.listen(PORT, ()=> console.log(`Servidor rodando na porta ${PORT}`));