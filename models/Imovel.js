import mongoose from "mongoose";


const imovelSchema = new mongoose.Schema({
  titulo: { type: String, required: true },
  endereco: { type: String, required: true },
  latitude: { type: String, required: true }, 
  longitude: { type: String, required: true }, 
  nivelDoMar: { type: Number, required: true },
  valorAtual: { type: String, required: true },
  valorPrevisto: Number,
  risco: String,
  imagem: String,
  linkLocalizacao: String
});


export default mongoose.model("Imovel", imovelSchema);
