import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const router = express.Router();


// 📝 CADASTRO
router.post("/register", async (req, res) => {
  const { nome, email, senha } = req.body;

  // 🔒 validação básica
  if (!nome || !email || !senha) {
    return res.status(400).json({
      message: "Preencha todos os campos",
    });
  }

  try {
    const userExist = await User.findOne({ email });

    if (userExist) {
      return res.status(400).json({
        message: "Usuário já existe",
      });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const user = await User.create({
      nome,
      email,
      senha: senhaHash,
    });

    // ❌ nunca retorne senha
    res.status(201).json({
      message: "Usuário criado com sucesso",
      user: {
        id: user._id,
        nome: user.nome,
        email: user.email,
      },
    });

  } catch (err) {
    console.error("[REGISTER]", err);
    res.status(500).json({ message: err.message });
  }
});


// 🔑 LOGIN
router.post("/login", async (req, res) => {
  const { email, senha } = req.body;

  // 🔒 validação
  if (!email || !senha) {
    return res.status(400).json({
      message: "Email e senha são obrigatórios",
    });
  }

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: "Usuário não encontrado",
      });
    }

    const isMatch = await bcrypt.compare(senha, user.senha);

    if (!isMatch) {
      return res.status(401).json({
        message: "Senha inválida",
      });
    }

    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      user: {
        id: user._id,
        nome: user.nome,
        email: user.email,
      },
      token,
    });

  } catch (err) {
    console.error("[LOGIN]", err);
    res.status(500).json({ message: err.message });
  }
});

export default router;