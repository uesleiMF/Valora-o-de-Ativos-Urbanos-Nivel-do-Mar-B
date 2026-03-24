import express from "express";
import User from "../models/User.js";   // ajuste o caminho se necessário

const router = express.Router();

// ==================== REGISTER ====================
router.post("/register", async (req, res) => {
  try {
    const { nome, email, senha, usuario } = req.body;

    // Validação flexível (aceita "nome" ou "usuario")
    const usuarioFinal = usuario || nome;

    if (!usuarioFinal || !email || !senha) {
      return res.status(400).json({ 
        message: "Preencha todos os campos (nome/usuario, email e senha)" 
      });
    }

    if (senha.length < 6) {
      return res.status(400).json({ 
        message: "Senha deve ter pelo menos 6 caracteres" 
      });
    }

    // Verifica se já existe
    const existingUser = await User.findOne({ 
      $or: [{ email }, { usuario: usuarioFinal }] 
    });

    if (existingUser) {
      return res.status(400).json({ 
        message: "Email ou usuário já cadastrado" 
      });
    }

    // Cria o usuário
    const newUser = new User({
      usuario: usuarioFinal,
      nome: nome || usuarioFinal,
      email,
      senha,                    // ← TODO: faça hash com bcrypt!
    });

    await newUser.save();

    res.status(201).json({
      message: "Usuário cadastrado com sucesso!",
      user: {
        id: newUser._id,
        nome: newUser.nome,
        email: newUser.email,
        usuario: newUser.usuario,
      }
    });

  } catch (error) {
    console.error("Erro no register:", error);
    res.status(500).json({ message: "Erro interno ao cadastrar usuário" });
  }
});

// ==================== LOGIN ====================
// (adicione aqui sua rota de login se ainda não tiver)

export default router;