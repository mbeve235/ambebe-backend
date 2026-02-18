# E-commerce API

Plataforma de e-commerce robusta e modular desenvolvida com **Node.js**, **TypeScript**, **Express**, **Prisma** e **MariaDB**. API REST completa com autenticação, controle de acesso, gestão de produtos, pedidos, cupons, pagamentos e suporte ao cliente.

## 📋 Sumário

- [Recursos](#recursos)
- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Configuração](#configuração)
- [Scripts](#scripts)
- [Endpoints](#endpoints)
- [Exemplos de Uso](#exemplos-de-uso)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Tecnologias](#tecnologias)

## ✨ Recursos

- ✅ **Autenticação & Autorização** - JWT com refresh tokens
- ✅ **Verificação de Email** - Sistema de tokens de verificação
- ✅ **Reset de Senha** - Tokens seguros de reset
- ✅ **Gestão de Produtos** - CRUD com variantes e atributos
- ✅ **Upload de Imagens** - Storage local/S3
- ✅ **Carrinho de Compras** - Persistente e idempotente
- ✅ **Gestão de Pedidos** - Estados, rastreamento
- ✅ **Pagamentos** - Stripe, M-Pesa
- ✅ **Sistema de Cupons** - Descontos com validações
- ✅ **Suporte ao Cliente** - Tickets e respostas
- ✅ **Auditoria** - Log de ações administrativas
- ✅ **Rate Limiting** - Proteção contra abuso
- ✅ **Swagger/OpenAPI** - Documentação interativa

## 🔧 Pré-requisitos

- **Node.js** 18.0+
- **npm** 9.0+ ou **yarn**
- **Docker** (para MariaDB e Redis)
- **MariaDB** 10.6+ (ou MySQL 8.0+)
- **Redis** 6.0+ (opcional, para cache)

## 🚀 Instalação

### 1. Clone o repositório
```bash
git clone <seu-repositorio>
cd backend
```

### 2. Instale as dependências
```bash
npm install
```

### 3. Suba os serviços (MariaDB + Redis)
```bash
docker-compose up -d
```

### 4. Configure variáveis de ambiente
```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas credenciais:
```env
DATABASE_URL="mysql://user:password@localhost:3306/ecommerce"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="seu_secret_jwt_aqui"
NODE_ENV="development"
PORT=4000
```

### 5. Execute as migrações do banco
```bash
npm run prisma:migrate
```

### 6. (Opcional) Seed inicial de dados
```bash
npm run prisma:seed
```

### 7. Inicie o servidor
```bash
npm run dev
```

A API estará disponível em `http://localhost:4000`

📚 **Documentação Swagger:** `http://localhost:4000/docs`

## 📝 Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia servidor em modo desenvolvimento (hot reload) |
| `npm run build` | Compila TypeScript para JavaScript |
| `npm run start` | Inicia servidor em produção |
| `npm run lint` | Executa linter |
| `npm run prisma:migrate` | Executa migrações do Prisma |
| `npm run prisma:seed` | Popula banco com dados iniciais |
| `npm run prisma:studio` | Abre Prisma Studio (gerenciador visual) |

## 🛣️ Endpoints

A API está organizada em rotas versionadas (`/v1`):

| Rota | Descrição |
|------|-----------|
| `/v1/public/*` | Endpoints públicos (catálogo, busca) |
| `/v1/auth/*` | Autenticação (login, registro, refresh) |
| `/v1/me/*` | Perfil do usuário (dados, carrinho, pedidos) |
| `/v1/backoffice/*` | Gerenciamento de loja (produtos, pedidos) |
| `/v1/admin/*` | Administração (users, cupons, relatórios) |
| `/v1/staff/*` | Atendimento (suporte, devolução) |
| `/v1/system/*` | Sistema (saúde, auditoria) |

## 💻 Exemplos de Uso

### Login
```bash
curl -X POST http://localhost:4000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "12345678"
  }'
```

**Resposta:**
```json
{
  "accessToken": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refreshToken": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "CUSTOMER"
  }
}
```

### Criar Produto (Backoffice)
```bash
curl -X POST http://localhost:4000/v1/backoffice/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -d '{
    "name": "Camiseta Premium",
    "slug": "camiseta-premium",
    "description": "Camiseta 100% algodão",
    "basePrice": 79.90,
    "status": "ACTIVE",
    "variants": [
      {
        "sku": "CAM-001-P",
        "name": "Tamanho P",
        "price": 79.90,
        "stock": 100,
        "attributes": { "size": "P", "color": "Preto" }
      }
    ]
  }'
```

### Upload de Imagem do Produto
```bash
curl -X POST http://localhost:4000/v1/backoffice/products/<PRODUCT_ID>/images/upload \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -F "file=@produto.jpg" \
  -F "sortOrder=0"
```

### Listar Catálogo (Público)
```bash
curl http://localhost:4000/v1/public/products?page=1&limit=20
```

### Adicionar ao Carrinho
```bash
curl -X POST http://localhost:4000/v1/me/cart/items \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "variantId": "uuid",
    "quantity": 2
  }'
```

### Checkout (Idempotente)
```bash
curl -X POST http://localhost:4000/v1/me/checkout \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentMethod": "STRIPE",
    "shippingAddress": {
      "street": "Rua Principal",
      "number": "123",
      "city": "Maputo",
      "zipCode": "1100"
    }
  }'
```

## 📁 Estrutura do Projeto

```
backend/
├── src/
│   ├── app.ts              # Configuração do Express
│   ├── server.ts           # Inicialização do servidor
│   ├── config/             # Configurações (DB, Redis, JWT, etc)
│   ├── controllers/        # Handlers de rotas
│   ├── middlewares/        # Middlewares (auth, validação, etc)
│   ├── routes/             # Definição de rotas
│   ├── services/           # Lógica de negócio
│   ├── repositories/       # Acesso a dados
│   ├── types/              # Type definitions
│   ├── utils/              # Utilitários
│   └── tests/              # Testes
├── prisma/
│   ├── schema.prisma       # Schema do banco
│   ├── seed.ts             # Seed de dados
│   └── migrations/         # Migrações do banco
├── uploads/                # Storage local de arquivos
├── docker-compose.yml      # Serviços (MariaDB, Redis)
├── .env.example            # Template de variáveis
├── package.json
├── tsconfig.json
└── README.md
```

## 🛠️ Tecnologias

### Backend
- **Express** - Framework web
- **TypeScript** - Tipagem estática
- **Prisma** - ORM moderno
- **MariaDB/MySQL** - Banco de dados
- **Redis** - Cache e sessões
- **JWT** - Autenticação
- **Stripe** - Pagamentos
- **M-Pesa** - Pagamentos móveis
- **Swagger** - Documentação API

### Desenvolvimento
- **Node.js 18+**
- **Docker** - Containerização
- **ESLint** - Linting
- **TypeScript** - Compilação

## 📖 Documentação

Consulte a documentação completa em:
- **Swagger/OpenAPI:** `http://localhost:4000/docs`
- **Prisma Studio:** `npm run prisma:studio`

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/amazing-feature`)
3. Commit suas mudanças (`git commit -m 'Add amazing feature'`)
4. Push para a branch (`git push origin feature/amazing-feature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 📞 Suporte

Para dúvidas ou problemas, abra uma [issue](../../issues) ou entre em contato através do email de suporte.
- Uploads locais sao servidos em `/uploads`.
- Para S3, configure `STORAGE_PROVIDER=s3` e as variaveis `S3_*`.
- Redis e opcional; em dev cai para memoria.

## M-PESA
- Configure `MPESA_BASE_URL`, `MPESA_API_KEY`, `MPESA_PUBLIC_KEY` e `MPESA_SERVICE_PROVIDER_CODE`.
- Configure `MPESA_SESSION_PATH` para o endpoint de sessao (ex: `/ipg/v2/vodacomMOZ/getSession/`).
- O path do pagamento pode ser ajustado com `MPESA_C2B_PATH` (padrao `/ipg/v2/[market]/c2bPayment/singleStage/`).
- `MPESA_MARKET` e `MPESA_ENVIRONMENT` ajudam a montar paths quando `MPESA_SESSION_PATH` nao e informado.
- Configure `MPESA_COUNTRY` e `MPESA_CURRENCY` conforme o market (ex: `GHA`/`GHS`, `MOZ`/`MZN`).
- `MPESA_PURCHASE_DESC` define a descricao enviada em `input_PurchasedItemsDesc`.
- `MPESA_SESSION_DELAY_MS` permite aguardar alguns segundos antes do C2B (a sessao pode demorar para ficar ativa).
- `MPESA_ORIGIN` e opcional. `MPESA_TIMEOUT_MS` define o timeout da chamada.
