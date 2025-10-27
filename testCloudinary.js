import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Permite usar __dirname em módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

// Configura o Cloudinary com as variáveis do .env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const imagePath = path.join(__dirname, 'public', 'teste.jpeg'); // Caminho absoluto

async function uploadTest() {
  try {
    console.log('📤 Enviando imagem de teste...');
    const result = await cloudinary.uploader.upload(imagePath, {
      folder: 'imoveis-teste',
    });
    console.log('✅ Upload concluído!');
    console.log('🌐 URL:', result.secure_url);
  } catch (error) {
    console.error('❌ Erro ao enviar imagem:', error);
  }
}

uploadTest();
