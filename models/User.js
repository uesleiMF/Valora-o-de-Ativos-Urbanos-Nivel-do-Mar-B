import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    nome: { type: String, required: true },

    usuario: { 
      type: String, 
      unique: true, 
      required: true 
    }, // 👈 ADICIONA ISSO

    email: { 
      type: String, 
      unique: true, 
      required: true 
    },

    senha: { 
      type: String, 
      required: true 
    },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);