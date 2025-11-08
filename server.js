const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');

const app = express();
const port = 3000;

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'fasipe',
    database: 'Topicos'
});

db.connect((err) => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados:', err);
        return;
    }
    console.log('Conectado ao banco de dados MySQL');
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: 'seu-segredo-aqui',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

app.use(express.static('public'));

function verificarAutenticacao(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/');
    }
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/produtos', verificarAutenticacao, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'produtos.html'));
});

app.get('/pagamento', verificarAutenticacao, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pagamento.html'));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    const query = 'SELECT * FROM usuarios WHERE Nome = ? AND senha = ?';
    db.query(query, [username, password], (err, results) => {
        if (err) {
            console.error('Erro na consulta:', err);
            res.status(500).json({ success: false, message: 'Erro interno do servidor' });
            return;
        }

        if (results.length > 0) {
            req.session.userId = results[0].id;
            req.session.userName = results[0].Nome;
            res.json({ success: true, message: 'Login realizado com sucesso!' });
        } else {
            res.json({ success: false, message: 'Usuário ou senha incorretos' });
        }
    });
});

app.get('/api/produtos', verificarAutenticacao, (req, res) => {
    const query = 'SELECT id, nome, quantidade_estoque, preco FROM produtos WHERE quantidade_estoque > 0';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Erro na consulta:', err);
            res.status(500).json({ success: false, message: 'Erro ao buscar produtos' });
            return;
        }
        res.json({ success: true, produtos: results });
    });
});

app.post('/api/compra-direta', verificarAutenticacao, (req, res) => {
    const { produtoId, nomeProduto, quantidade } = req.body;
    
    req.session.compraDireta = {
        produtoId,
        nomeProduto,
        quantidade,
    };

    res.json({ success: true, message: 'Produto selecionado para compra' });
});

app.get('/api/compra-direta', verificarAutenticacao, (req, res) => {
    const compra = req.session.compraDireta || null;
    res.json({ success: true, compra });
});

app.post('/api/finalizar-compra', verificarAutenticacao, (req, res) => {
    const { formaPagamento } = req.body;
    const compra = req.session.compraDireta;
    
    if (!compra) {
        res.json({ success: false, message: 'Nenhum produto selecionado' });
        return;
    }

    const total = compra.total;
    
    const queryPedido = 'INSERT INTO pedidos (usuario_id, forma_pagamento, total, data_pedido) VALUES (?, ?, ?, NOW())';
    db.query(queryPedido, [req.session.userId, formaPagamento, total], (err, result) => {
        if (err) {
            console.error('Erro ao registrar pedido:', err);
            res.status(500).json({ success: false, message: 'Erro ao processar compra' });
            return;
        }

        const pedidoId = result.insertId;

        const queryItem = 'INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)';
        db.query(queryItem, [pedidoId, compra.produtoId, compra.quantidade, compra.preco], (err) => {
            if (err) {
                console.error('Erro ao inserir item:', err);
                res.status(500).json({ success: false, message: 'Erro ao processar compra' });
                return;
            }

            const queryEstoque = 'UPDATE produtos SET quantidade_estoque = quantidade_estoque - ? WHERE id = ?';
            db.query(queryEstoque, [compra.quantidade, compra.produtoId], (err) => {
                if (err) {
                    console.error('Erro ao atualizar estoque:', err);
                    res.status(500).json({ success: false, message: 'Erro ao processar compra' });
                    return;
                }

                req.session.compraDireta = null;
                res.json({ 
                    success: true, 
                    message: 'Compra registrada com sucesso!',
                    pedidoId: pedidoId
                });
            });
        });
    });
});

// Rota de logout
app.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});