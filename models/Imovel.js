import mongoose from "mongoose";

const imovelSchema = new mongoose.Schema({
  titulo: { type: String },
  endereco: { type: String },
  latitude: { type: Number },
  longitude: { type: Number },
  nivelDoMar: { type: Number },
  valorAtual: { type: Number },
  valorPrevisto: { type: Number },
  risco: { type: String },
  imagem: { type: String }
}, { timestamps: true });

export default mongoose.model("Imovel", imovelSchema);