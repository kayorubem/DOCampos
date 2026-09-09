import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import FormData from 'form-data';

const URL_DIARIO = 'https://campos.rj.gov.br/diario-oficial'; 
const STATE_FILE = './ultimo_diario.json';

// Puxa as credenciais de forma segura do GitHub Secrets
const TOKEN_TELEGRAM = process.env.TOKEN_TELEGRAM; 
const CHAT_ID = process.env.CHAT_ID;

async function verificarDiario() {
    try {
        console.log('Verificando a página do Diário Oficial...');
        
        const { data: html } = await axios.get(URL_DIARIO);
        const $ = cheerio.load(html);

        const artigoMaisRecente = $('.ldo-lista .ldo-item').first();
        
        if (!artigoMaisRecente.length) return;

        const titulo = artigoMaisRecente.find('.ldo-titulo').text().trim();
        const linkPdf = artigoMaisRecente.find('.ldo-acessar').attr('href');

        if (!linkPdf) return;

        let estadoSalvo = {};
        if (fs.existsSync(STATE_FILE)) {
            estadoSalvo = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        }

        if (estadoSalvo.ultimoLink !== linkPdf) {
            console.log(`Nova publicação: ${titulo}`);
            
            const enviado = await enviarPdfTelegram(titulo, linkPdf);

            if (enviado) {
                // Atualiza o arquivo local (o GitHub fará o commit dele depois)
                fs.writeFileSync(STATE_FILE, JSON.stringify({ ultimoLink: linkPdf, dataHora: new Date() }, null, 2));
                console.log('Arquivo ultimo_diario.json atualizado.');
            }
        } else {
            console.log('Nenhuma publicação nova até o momento.');
        }
    } catch (error) {
        console.error('Erro ao acessar o site:', error.message);
    }
}

async function enviarPdfTelegram(titulo, linkPdf) {
    try {
        console.log('Baixando o arquivo PDF...');
        const respostaPdf = await axios.get(linkPdf, { responseType: 'stream' });
        
        const formData = new FormData();
        formData.append('chat_id', CHAT_ID);
        formData.append('document', respostaPdf.data, 'Diario_Oficial_Campos.pdf'); 
        formData.append('caption', `📰 *Novo Diário Oficial Publicado*\n\n${titulo}\n🔗 [Link Original](${linkPdf})`);
        formData.append('parse_mode', 'Markdown');

        await axios.post(`https://api.telegram.org/bot${TOKEN_TELEGRAM}/sendDocument`, formData, {
            headers: formData.getHeaders()
        });

        console.log('✅ PDF enviado com sucesso pelo Telegram!');
        return true;
    } catch (erro) {
        console.error('❌ Erro ao enviar para o Telegram:', erro.message);
        return false;
    }
}

// Executa a função uma única vez e encerra
verificarDiario();