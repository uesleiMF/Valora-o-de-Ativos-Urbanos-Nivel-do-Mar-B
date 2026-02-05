import mongoose from "mongoose";

const imovelSchema = new mongoose.Schema({
  titulo: { type: String, required: true },
  tipo: { 
    type: String, 
    required: true,
    enum: ["casa", "apartamento", "terreno", "comercial"]
  },
  endereco: { type: String, required: true },
  latitude: { type: String, required: true }, 
  longitude: { type: String, required: true }, 
  nivelDoMar: { type: Number, required: true },
  valorAtual: { type: String, required: true },
  valorPrevisto: String,
  risco: String,
  imagem: String,
  linkLocalizacao: String
}, { timestamps: true });

export default mongoose.model("Imovel", imovelSchema);
