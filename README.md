# Cyber Security Advisor Bot

**Cyber Security** Advisor is a privacy-preserving, RAG-based AI chatbot that delivers accurate, citation-backed cybersecurity guidance grounded in authoritative standards such as NIST, OWASP, CERT, MITRE ATT&CK, and CIS Controls.

## Overview

Most cyber incidents stem from a lack of security awareness among everyday users. Existing solutions — whether rule-based systems or cloud-only LLM chatbots — fall short: they either lack depth, raise privacy concerns, or hallucinate unsupported answers. Cyber Security Advisor solves this by combining Retrieval-Augmented Generation (RAG) with a dual-mode LLM inference architecture, giving users a choice between full privacy and high performance.

## How It Works

The system is built on three core modules:

- **Knowledge Ingestion & Indexing**: Documents from NIST SP 800 series, OWASP Top 10, CISA, CERT, SANS, and more are parsed (PDF, HTML, XML, CSV), chunked (800 tokens, 120 token overlap), and embedded using sentence-transformers/all-MiniLM-L6-v2 into a Qdrant vector database with cosine similarity indexing.
- **Semantic Retrieval**: User queries are embedded using the same model, and the top-4 most relevant chunks are retrieved via cosine similarity search, forming a grounded prompt context.
- **Dual-Mode Answer Generation**: Responses are generated strictly from retrieved context with mandatory source citations ([URL]) -
  - **Local Mode**: Uses Llama 3.2 via Ollama for fully offline, privacy-preserving inference.
  - **Cloud Mode**: Uses GPT-4o-mini via OpenAI API for improved speed and response quality.

## Tech Stack Summary

| Layer         | Technology                                      |
|---------------|-------------------------------------------------|
| Frontend      | Next.js 14, React 18                            |
| Backend       | Django 5, Django REST Framework                 |
| Vector DB     | Qdrant                                          |
| Embeddings    | `sentence-transformers/all-MiniLM-L6-v2`        |
| Local LLM     | Llama 3.2 via Ollama                            |
| Cloud LLM     | GPT-4o-mini via OpenAI API                      |
| OCR           | Tesseract + pytesseract                         |
| Containerization | Docker & Docker Compose                      |

## Project Structure

The organized project structure is given below:
```
cybersec_advisor_bot/
├── docker-compose.yml              # Orchestrates all services (API, Qdrant, Ollama, Frontend)
│
├── backend/                        # Django REST API
│   ├── advisor/
│   │   ├── __init__.py
│   │   ├── apps.py
│   │   └── views.py                # All API logic: ingestion, RAG, LLM calls, analysis
│   ├── core/
│   │   ├── settings.py             # Django settings
│   │   ├── urls.py                 # API route definitions
│   │   ├── asgi.py
│   │   └── wsgi.py
│   ├── templates/
│   │   └── index.html
│   ├── manage.py
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env                        # Your local environment variables
│   └── .env.example                # Template for environment setup
│
└── frontend/                       # Next.js UI
    ├── pages/
    │   ├── _app.js
    │   └── index.js                # Main chat interface
    ├── next.config.js
    ├── package.json
    ├── Dockerfile
    ├── .env.local
    └── .env.example
```

## Installation & Setup Guide

There are two ways to run this project: Docker (recommended) or manual setup for each component.

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for manual frontend setup)
- Python 3.11+ (for manual backend setup)
- Ollama (for local LLM mode only)

---

## Option 1: Run with Docker (Recommended)

This single command spins up all four services: **Django API**, **Qdrant vector DB**, **Ollama**, and the **Next.js frontend**.

### 1. Clone the repository

```bash
git clone https://github.com/your-username/cybersec_advisor_bot.git
cd cybersec_advisor_bot
```

### 2. Configure environment variables

```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` and fill in your values:

```env
# LLM Mode: LOCAL (uses Ollama) or CLOUD (uses OpenAI)
MODE=LOCAL

# Only required if MODE=CLOUD
OPENAI_API_KEY=sk-xxxx

# Embedding model (do not change unless you know what you're doing)
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2

# Qdrant connection (default Docker service name)
QDRANT_URL=http://qdrant:6333
QDRANT_COLLECTION=cybersec_docs

# Django
DJANGO_SECRET_KEY=your-secret-key-here
DJANGO_DEBUG=True
ALLOWED_HOSTS=*
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

### 3. Start all services

```bash
docker-compose up --build
```

### 4. Pull the local LLM model (if using LOCAL mode)

In a new terminal, after Docker is up:

```bash
docker exec -it ollama ollama pull llama3.2
```

### 5. Access the app

| Service        | URL                        |
|----------------|----------------------------|
| Frontend UI    | http://localhost:3000      |
| Backend API    | http://localhost:4555      |
| Qdrant Dashboard | http://localhost:6333/dashboard |
| Ollama         | http://localhost:11434     |

---

## Option 2: Manual Setup (Component by Component)

### Part A — Local LLM Setup (Ollama)

> Skip this part if you plan to use `MODE=CLOUD` with OpenAI.

**1. Install Ollama**

Visit [https://ollama.com](https://ollama.com) and install for your OS. Then pull the required model:

```bash
ollama pull llama3.2
```

**2. Start Ollama**

Ollama runs as a background service automatically after installation. Verify it's running:

```bash
curl http://localhost:11434
```

You should see a response confirming Ollama is active. By default it listens on port `11434`.

---

### Part B — Vector Database (Qdrant)

You can run Qdrant with Docker (even without the full docker-compose):

```bash
docker run -d -p 6333:6333 -p 6334:6334 \
  -v qdrant_storage:/qdrant/storage \
  qdrant/qdrant
```

Verify it's running at: http://localhost:6333/dashboard

---

### Part C — Backend (Django)

**1. Navigate to the backend directory**

```bash
cd backend
```

**2. Create and activate a virtual environment**

```bash
python -m venv venv
source venv/bin/activate        # On Windows: venv\Scripts\activate
```

**3. Install dependencies**

```bash
pip install -r requirements.txt
```

> **Note:** `pytesseract` requires Tesseract OCR to be installed on your system.
> - **Ubuntu/Debian:** `sudo apt-get install tesseract-ocr`
> - **macOS:** `brew install tesseract`
> - **Windows:** Download from [https://github.com/UB-Mannheim/tesseract/wiki](https://github.com/UB-Mannheim/tesseract/wiki)

**4. Set up environment variables**

```bash
cp .env.example .env
```

Edit `.env` and update the Qdrant URL to point to localhost:

```env
MODE=LOCAL                          # or CLOUD
OPENAI_API_KEY=sk-xxxx              # only if MODE=CLOUD
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
QDRANT_URL=http://localhost:6333    # local Qdrant
QDRANT_COLLECTION=cybersec_docs
DJANGO_SECRET_KEY=your-secret-key
DJANGO_DEBUG=True
ALLOWED_HOSTS=*
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

**5. Run migrations and start the server**

```bash
python manage.py migrate
python manage.py runserver 8000
```

The backend API will be available at: http://localhost:8000

---

### Part D — Frontend (Next.js)

**1. Navigate to the frontend directory**

```bash
cd frontend
```

**2. Install dependencies**

```bash
npm install
```

**3. Set up environment variables**

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

> If you are running the backend via Docker Compose, use port `4555` instead:
> ```env
> NEXT_PUBLIC_API_BASE=http://localhost:4555
> ```

**4. Start the development server**

```bash
npm run dev
```

The frontend will be available at: http://localhost:3000

---

## API Endpoints Reference

| Method | Endpoint              | Description                                      |
|--------|-----------------------|--------------------------------------------------|
| POST   | `/api/ask`            | Ask a cybersecurity question (RAG + LLM)         |
| POST   | `/api/ingest/url`     | Ingest a webpage URL into the knowledge base     |
| POST   | `/api/ingest/pdf`     | Upload a PDF document to the knowledge base      |
| POST   | `/api/integrity`      | Check text for similarity/plagiarism             |
| POST   | `/api/analyze/email`  | Analyze a `.eml` email file for phishing/spam    |
| POST   | `/api/analyze/image`  | Analyze a screenshot/image for security threats  |

---

## Switching Between LOCAL and CLOUD Mode

Open `backend/.env` and change the `MODE` variable:

```env
# For fully offline, privacy-preserving inference (Llama 3.2 via Ollama):
MODE=LOCAL

# For higher quality, faster responses (GPT-4o-mini via OpenAI):
MODE=CLOUD
OPENAI_API_KEY=sk-your-key-here
```

Restart the backend after changing this value.

---