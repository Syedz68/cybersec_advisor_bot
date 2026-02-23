import os, re, uuid, requests, json, base64
from email import policy
from email.parser import BytesParser
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.shortcuts import render
from bs4 import BeautifulSoup
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.http.models import VectorParams, Distance, PointStruct
from pypdf import PdfReader
from PIL import Image
import io
try:
    import pytesseract
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False
    print("WARNING: pytesseract not available. OCR functionality will be limited.")

# --- Env
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "cybersec_docs")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
MODE = os.getenv("MODE", "LOCAL")  # LOCAL/CLOUD

# --- Lazy singletons
_embedder = None
_qdrant = None

def embedder():
    global _embedder
    if _embedder is None:
        _embedder = SentenceTransformer(EMBEDDING_MODEL)
    return _embedder

def qdrant():
    global _qdrant
    if _qdrant is None:
        _qdrant = QdrantClient(url=QDRANT_URL)
        cols = [c.name for c in _qdrant.get_collections().collections]
        if QDRANT_COLLECTION not in cols:
            _qdrant.recreate_collection(
                collection_name=QDRANT_COLLECTION,
                vectors_config=VectorParams(size=embedder().get_sentence_embedding_dimension(), distance=Distance.COSINE),
            )
    return _qdrant

def clean_text(t: str) -> str:
    t = re.sub(r"\s+", " ", t)
    return t.strip()

def chunk_text(text, size=800, overlap=120):
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = words[i:i+size]
        chunks.append(" ".join(chunk))
        i += size - overlap
        if i <= 0:
            i = len(words)
    return chunks

def extract_text_from_url(url: str) -> str:
    r = requests.get(url, timeout=20)
    soup = BeautifulSoup(r.text, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    return clean_text(soup.get_text(separator=" "))

def extract_text_from_pdf(file) -> str:
    reader = PdfReader(file)
    texts = []
    for page in reader.pages:
        try:
            texts.append(page.extract_text() or "")
        except Exception:
            pass
    return clean_text(" ".join(texts))

def extract_text_from_email(file) -> dict:
    """Extract text and metadata from .eml email file"""
    try:
        # Read the email file
        file.seek(0)
        email_content = file.read()
        
        # Parse email
        msg = BytesParser(policy=policy.default).parsebytes(email_content)
        
        # Extract headers
        subject = msg.get('Subject', '')
        from_addr = msg.get('From', '')
        to_addr = msg.get('To', '')
        date = msg.get('Date', '')
        
        # Extract body text
        body_text = ""
        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                if content_type == "text/plain":
                    try:
                        body_text += part.get_payload(decode=True).decode('utf-8', errors='ignore')
                    except:
                        pass
                elif content_type == "text/html":
                    try:
                        html_content = part.get_payload(decode=True).decode('utf-8', errors='ignore')
                        soup = BeautifulSoup(html_content, "html.parser")
                        body_text += clean_text(soup.get_text(separator=" "))
                    except:
                        pass
        else:
            try:
                body_text = msg.get_payload(decode=True).decode('utf-8', errors='ignore')
                if msg.get_content_type() == "text/html":
                    soup = BeautifulSoup(body_text, "html.parser")
                    body_text = clean_text(soup.get_text(separator=" "))
            except:
                body_text = str(msg.get_payload())
        
        # Extract links from HTML if present
        links = []
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/html":
                    try:
                        html_content = part.get_payload(decode=True).decode('utf-8', errors='ignore')
                        soup = BeautifulSoup(html_content, "html.parser")
                        for a in soup.find_all('a', href=True):
                            links.append(a['href'])
                    except:
                        pass
        
        # Combine all text for analysis
        full_text = f"Subject: {subject}\nFrom: {from_addr}\nTo: {to_addr}\nDate: {date}\n\n{body_text}"
        if links:
            full_text += f"\n\nLinks found: {', '.join(links)}"
        
        return {
            "subject": subject,
            "from": from_addr,
            "to": to_addr,
            "date": date,
            "body": clean_text(body_text),
            "links": links,
            "full_text": clean_text(full_text)
        }
    except Exception as e:
        raise Exception(f"Failed to parse email: {str(e)}")

def extract_text_from_image(file) -> dict:
    """Extract text and metadata from image file using OCR"""
    try:
        # Open image
        file.seek(0)
        img = Image.open(io.BytesIO(file.read()))
        
        # Get image metadata
        width, height = img.size
        format_name = img.format or "Unknown"
        mode = img.mode
        
        # Extract text using OCR if available
        extracted_text = ""
        ocr_note = ""
        if OCR_AVAILABLE:
            try:
                # Convert image to RGB if necessary (pytesseract requires RGB)
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                
                # Perform OCR
                extracted_text = pytesseract.image_to_string(img)
                extracted_text = clean_text(extracted_text)
                
                if extracted_text:
                    ocr_note = f"Text extracted from image via OCR ({len(extracted_text)} characters)."
                else:
                    ocr_note = "OCR performed but no text was detected in the image."
            except Exception as ocr_error:
                ocr_note = f"OCR attempted but failed: {str(ocr_error)}"
        else:
            ocr_note = "OCR not available (pytesseract not installed). Only visual analysis can be performed."
        
        metadata = {
            "width": width,
            "height": height,
            "format": format_name,
            "mode": mode,
            "text": extracted_text,
            "note": ocr_note
        }
        
        return metadata
    except Exception as e:
        raise Exception(f"Failed to process image: {str(e)}")

def index(request):
    return render(request, "index.html")

def upsert_chunks(chunks, meta):
    vectors = embedder().encode(chunks, convert_to_numpy=True).tolist()
    pts = []
    for c, v in zip(chunks, vectors):
        pts.append(PointStruct(id=str(uuid.uuid4()), vector=v, payload={**meta, "text": c}))
    qdrant().upsert(collection_name=QDRANT_COLLECTION, points=pts)

@csrf_exempt
def ingest_url(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST only"}, status=405)
    try:
        print(f"DEBUG: URL ingestion request received")
        data = json.loads(request.body.decode("utf-8"))
        url = data.get("url")
        print(f"DEBUG: URL to ingest: {url}")
        if not url:
            return JsonResponse({"error": "url required"}, status=400)
        
        print(f"DEBUG: Starting text extraction from URL")
        text = extract_text_from_url(url)
        print(f"DEBUG: Extracted text length: {len(text)}")
        
        print(f"DEBUG: Starting text chunking")
        chunks = chunk_text(text)
        print(f"DEBUG: Created {len(chunks)} chunks")
        
        print(f"DEBUG: Starting vector upsert")
        upsert_chunks(chunks, {"source": "url", "url": url})
        print(f"DEBUG: Successfully upserted {len(chunks)} chunks")
        
        return JsonResponse({"status": "ok", "chunks_count": len(chunks)})
    except Exception as e:
        print(f"DEBUG: URL ingestion error: {str(e)}")
        return JsonResponse({"error": str(e)}, status=500)

@csrf_exempt
def ingest_pdf(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST only"}, status=405)
    try:
        print(f"DEBUG: Request method: {request.method}")
        print(f"DEBUG: Content type: {request.content_type}")
        print(f"DEBUG: FILES keys: {list(request.FILES.keys())}")
        print(f"DEBUG: POST keys: {list(request.POST.keys())}")
        
        f = request.FILES.get("file")
        if not f:
            return JsonResponse({"error": "file required (multipart/form-data, field name 'file')"}, status=400)
        
        print(f"DEBUG: File name: {getattr(f, 'name', 'unknown')}")
        print(f"DEBUG: File size: {getattr(f, 'size', 'unknown')}")
        print(f"DEBUG: File type: {getattr(f, 'content_type', 'unknown')}")
        
        text = extract_text_from_pdf(f)
        if not text:
            return JsonResponse({"error": "could not read pdf text"}, status=400)
        chunks = chunk_text(text)
        upsert_chunks(chunks, {"source": "pdf", "filename": getattr(f, 'name', 'upload.pdf')})
        return JsonResponse({"status": "ok", "chunks_count": len(chunks)})
    except Exception as e:
        print(f"DEBUG: Exception: {str(e)}")
        return JsonResponse({"error": str(e)}, status=500)

def search_similar(query: str, top_k=6):
    vec = embedder().encode([query], convert_to_numpy=True)[0].tolist()
    res = qdrant().search(collection_name=QDRANT_COLLECTION, query_vector=vec, limit=top_k)
    return [{"text": r.payload.get("text"), "url": r.payload.get("url"), "source": r.payload.get("source"), "score": float(r.score)} for r in res]

def redact_pii(text: str) -> str:
    text = re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[EMAIL]", text)
    text = re.sub(r"\b\d{11,16}\b", "[NUMBER]", text)
    return text

def build_prompt(question: str, contexts):
    header = "You are a conservative, privacy-preserving cybersecurity advisor. Answer ONLY using the provided CONTEXT. Cite each claim with (source). If unsure, say what is missing.\n"
    ctx = "\n\n".join([f"[{i+1}] {c['text'][:1200]}\n(Source: {c.get('url') or c.get('source')})" for i, c in enumerate(contexts)])
    return f"""{header}
CONTEXT:
{ctx}

QUESTION: {question}

FINAL ANSWER (with citations):
"""

def call_ollama(prompt: str, model="llama3.2"):
    try:
        import requests, os
        
        # Smart Ollama detection: Prioritize Docker Ollama when in container, then local fallback
        # Check if we're running in Docker (by checking if we can resolve 'ollama' hostname)
        ollama_urls = [
            os.getenv("OLLAMA_BASE_URL"),  # User override (highest priority)
            "http://ollama:11434",  # Docker Ollama (prioritized when in Docker)
            "http://host.docker.internal:11434",  # Local Ollama from Docker container
            "http://localhost:11434",  # Direct local access (fallback)
        ]
        
        # Filter out None values
        ollama_urls = [url for url in ollama_urls if url]
        
        last_error = None
        for ollama_url in ollama_urls:
            try:
                r = requests.post(f"{ollama_url}/api/generate", 
                                json={"model": model, "prompt": prompt, "stream": False}, 
                                timeout=30)
                j = r.json()
                return j.get("response", "").strip()
            except Exception as e:
                last_error = e
                continue
        
        return f"[LLM Error: No Ollama available. Tried: {', '.join(ollama_urls)}. Last error: {last_error}]"
    except Exception as e:
        return f"[LLM Error: {e}]"

def call_openai(prompt: str):
    import os, requests, json
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        return "[OPENAI_API_KEY missing]"
    url = "https://api.openai.com/v1/chat/completions"
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    payload = {"model": "gpt-4o-mini", "messages": [{"role": "user", "content": prompt}], "temperature": 0.2}
    r = requests.post(url, headers=headers, data=json.dumps(payload), timeout=120)
    j = r.json()
    try:
        return j["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return f"[OpenAI error: {e} | {j}]"

@csrf_exempt
def ask(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST only"}, status=405)
    try:
        data = json.loads(request.body.decode("utf-8"))
        question = redact_pii(data.get("question", ""))[:2000]
        top_k = int(data.get("top_k", 8))  # Increased default to get more diverse citations
        mode = (data.get("mode") or os.getenv("MODE", "LOCAL")).upper()
        
        # Check if there's file context (for follow-up questions)
        file_context = data.get("file_context")
        if file_context:
            # Add file context to the question
            if file_context.get("type") == "email":
                question = f"""{question}

Email Context:
Subject: {file_context.get('subject', 'N/A')}
From: {file_context.get('from', 'N/A')}
Body: {file_context.get('body', '')[:1000]}
Links: {', '.join(file_context.get('links', [])) if file_context.get('links') else 'None'}"""
            elif file_context.get("type") == "image":
                question = f"""{question}

Image Context:
Format: {file_context.get('format', 'N/A')}
Dimensions: {file_context.get('dimensions', 'N/A')}"""
        
        contexts = search_similar(question, top_k=top_k)
        prompt = build_prompt(question, contexts)
        answer = call_openai(prompt) if mode == "CLOUD" else call_ollama(prompt)
        
        # Extract summary if present
        summary = ""
        full_answer = answer
        if "**TL;DR:**" in answer or "TL;DR:" in answer:
            import re
            tldr_match = re.search(r'\*\*TL;DR:\*\*\s*(.+?)(?:\n\n|\n#|\n\*\*|$)', answer, re.IGNORECASE | re.DOTALL)
            if not tldr_match:
                tldr_match = re.search(r'TL;DR:\s*(.+?)(?:\n\n|\n#|\n\*\*|$)', answer, re.IGNORECASE | re.DOTALL)
            if tldr_match:
                summary = tldr_match.group(1).strip()
                full_answer = re.sub(r'\*\*TL;DR:\*\*\s*.+?(?=\n\n|\n#|\n\*\*|$)', '', answer, flags=re.IGNORECASE | re.DOTALL)
                full_answer = re.sub(r'TL;DR:\s*.+?(?=\n\n|\n#|\n\*\*|$)', '', full_answer, flags=re.IGNORECASE | re.DOTALL)
                full_answer = full_answer.strip()
        
        return JsonResponse({"answer": full_answer, "summary": summary, "citations": contexts})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)

@csrf_exempt
def check_integrity(request):
    """Check text for similarity and plagiarism against knowledge base"""
    if request.method != "POST":
        return JsonResponse({"error": "POST only"}, status=405)
    try:
        print(f"DEBUG: Integrity check request received")
        data = json.loads(request.body.decode("utf-8"))
        text = data.get("text", "").strip()
        similarity_threshold = float(data.get("similarity_threshold", data.get("threshold", 0.05)))  # Backward compatibility
        plagiarism_threshold = float(data.get("plagiarism_threshold", 0.3))
        top_k = int(data.get("top_k", 10))
        
        print(f"DEBUG: Text to check: {text[:100]}...")
        print(f"DEBUG: Similarity threshold: {similarity_threshold}, Plagiarism threshold: {plagiarism_threshold}, Top K: {top_k}")
        
        if not text:
            return JsonResponse({"error": "Text is required"}, status=400)
        
        # Search for similar content in knowledge base
        print(f"DEBUG: Starting similarity search")
        similar_chunks = search_similar(text, top_k=top_k)
        print(f"DEBUG: Found {len(similar_chunks)} similar chunks")
        
        # Calculate similarity and plagiarism scores
        similarity_matches = []
        plagiarism_matches = []
        overall_similarity_score = 0
        overall_plagiarism_score = 0
        
        for i, chunk in enumerate(similar_chunks):
            # Improved similarity calculation: combine Jaccard and word overlap
            text_words = set(text.lower().split())
            chunk_words = set(chunk["text"].lower().split())
            intersection = len(text_words.intersection(chunk_words))
            union = len(text_words.union(chunk_words))
            
            # Jaccard similarity
            jaccard_sim = intersection / union if union > 0 else 0
            
            # Word overlap percentage (how much of the input text is covered)
            overlap_percentage = intersection / len(text_words) if len(text_words) > 0 else 0
            
            # Combined similarity: weighted average of Jaccard and overlap
            similarity = (jaccard_sim * 0.3) + (overlap_percentage * 0.7)
            
            print(f"DEBUG: Chunk {i}: similarity={similarity:.3f}, intersection={intersection}, union={union}")
            print(f"DEBUG: Text words: {len(text_words)}, Chunk words: {len(chunk_words)}")
            print(f"DEBUG: Chunk text preview: {chunk['text'][:100]}...")
            
            # Plagiarism detection: check for exact phrase matches and high word overlap
            text_phrases = text.lower().split()
            chunk_phrases = chunk["text"].lower().split()
            
            # Check for consecutive word sequences (phrases)
            max_phrase_length = min(len(text_phrases), len(chunk_phrases), 10)  # Check up to 10-word phrases
            phrase_matches = 0
            total_phrases = 0
            
            for phrase_len in range(3, max_phrase_length + 1):  # Check 3+ word phrases
                for i in range(len(text_phrases) - phrase_len + 1):
                    text_phrase = " ".join(text_phrases[i:i+phrase_len])
                    total_phrases += 1
                    for j in range(len(chunk_phrases) - phrase_len + 1):
                        chunk_phrase = " ".join(chunk_phrases[j:j+phrase_len])
                        if text_phrase == chunk_phrase:
                            phrase_matches += 1
                            break
            
            plagiarism_score = phrase_matches / total_phrases if total_phrases > 0 else 0
            
            # Similarity matches (general content similarity)
            if similarity >= similarity_threshold:
                similarity_matches.append({
                    "content": chunk["text"][:200] + "..." if len(chunk["text"]) > 200 else chunk["text"],
                    "source": chunk["source"],
                    "url": chunk["url"],
                    "similarity": round(similarity, 3),
                    "type": "similarity",
                    "needs_citation": similarity >= similarity_threshold
                })
                overall_similarity_score = max(overall_similarity_score, similarity)
            
            # Plagiarism matches (exact phrase matches)
            if plagiarism_score >= plagiarism_threshold:
                plagiarism_matches.append({
                    "content": chunk["text"][:200] + "..." if len(chunk["text"]) > 200 else chunk["text"],
                    "source": chunk["source"],
                    "url": chunk["url"],
                    "plagiarism_score": round(plagiarism_score, 3),
                    "type": "plagiarism",
                    "severity": "high" if plagiarism_score >= 0.7 else "medium" if plagiarism_score >= 0.5 else "low"
                })
                overall_plagiarism_score = max(overall_plagiarism_score, plagiarism_score)
        
        # Combine all matches
        all_matches = similarity_matches + plagiarism_matches
        
        # Calculate overall risk based on both similarity and plagiarism
        combined_score = max(overall_similarity_score, overall_plagiarism_score)
        overlap_percentage = min(95, int(combined_score * 100))
        
        # Determine risk status
        if overall_plagiarism_score >= plagiarism_threshold:
            risk_status = "high_risk"  # Plagiarism detected
        elif overall_similarity_score >= similarity_threshold:
            risk_status = "medium_risk"  # High similarity
        elif combined_score >= min(similarity_threshold, plagiarism_threshold):
            risk_status = "low_risk"  # Some similarity
        else:
            risk_status = "clean"  # No significant matches
        
        return JsonResponse({
            "overall_score": overlap_percentage,
            "similarity_score": int(overall_similarity_score * 100),
            "plagiarism_score": int(overall_plagiarism_score * 100),
            "similarity_threshold": similarity_threshold,
            "plagiarism_threshold": plagiarism_threshold,
            "matches": all_matches,
            "similarity_matches": len(similarity_matches),
            "plagiarism_matches": len(plagiarism_matches),
            "total_matches": len(all_matches),
            "status": risk_status,
            "analysis": {
                "has_plagiarism": overall_plagiarism_score >= plagiarism_threshold,
                "has_similarity": overall_similarity_score >= similarity_threshold,
                "plagiarism_severity": "high" if overall_plagiarism_score >= 0.7 else "medium" if overall_plagiarism_score >= 0.5 else "low" if overall_plagiarism_score >= plagiarism_threshold else "none"
            }
        })
        
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)

@csrf_exempt
def analyze_email(request):
    """Analyze email file (.eml) for phishing/spam"""
    if request.method != "POST":
        return JsonResponse({"error": "POST only"}, status=405)
    try:
        f = request.FILES.get("file")
        if not f:
            return JsonResponse({"error": "file required (multipart/form-data, field name 'file')"}, status=400)
        
        # Extract email content
        email_data = extract_text_from_email(f)
        
        # Use RAG to analyze for phishing/spam
        mode = (request.POST.get("mode") or os.getenv("MODE", "LOCAL")).upper()
        
        # Get user question if provided
        user_question = request.POST.get("question", "").strip()
        
        # Build analysis prompt
        if user_question:
            analysis_prompt = f"""{user_question}

Email Details:
Subject: {email_data['subject']}
From: {email_data['from']}
To: {email_data['to']}
Date: {email_data['date']}

Email Body:
{email_data['body'][:2000]}

Links Found: {', '.join(email_data['links']) if email_data['links'] else 'None'}

Please provide a detailed answer with citations from cybersecurity guidelines."""
        else:
            analysis_prompt = f"""Analyze this email for phishing, spam, or security threats.

Email Details:
Subject: {email_data['subject']}
From: {email_data['from']}
To: {email_data['to']}
Date: {email_data['date']}

Email Body:
{email_data['body'][:2000]}

Links Found: {', '.join(email_data['links']) if email_data['links'] else 'None'}

IMPORTANT: Start your response with a brief one-line summary in this exact format:
**TL;DR:** [One sentence summary - e.g., "This is a HIGH-RISK phishing email with suspicious links and urgent language."]

Then provide detailed analysis covering:
1. Phishing risk assessment (High/Medium/Low)
2. Spam indicators
3. Security concerns
4. Recommendations
5. Specific red flags found

Answer with citations from cybersecurity guidelines."""
        
        # Search knowledge base for relevant context
        contexts = search_similar(email_data['full_text'], top_k=4)
        
        # Build prompt with context
        prompt = build_prompt(analysis_prompt, contexts)
        
        # Get LLM analysis
        answer = call_openai(prompt) if mode == "CLOUD" else call_ollama(prompt)
        
        # Extract TL;DR summary if present
        summary = ""
        full_answer = answer
        if "**TL;DR:**" in answer or "TL;DR:" in answer:
            import re
            tldr_match = re.search(r'\*\*TL;DR:\*\*\s*(.+?)(?:\n\n|\n#|\n\*\*|$)', answer, re.IGNORECASE | re.DOTALL)
            if not tldr_match:
                tldr_match = re.search(r'TL;DR:\s*(.+?)(?:\n\n|\n#|\n\*\*|$)', answer, re.IGNORECASE | re.DOTALL)
            if tldr_match:
                summary = tldr_match.group(1).strip()
                # Remove TL;DR from main answer
                full_answer = re.sub(r'\*\*TL;DR:\*\*\s*.+?(?=\n\n|\n#|\n\*\*|$)', '', answer, flags=re.IGNORECASE | re.DOTALL)
                full_answer = re.sub(r'TL;DR:\s*.+?(?=\n\n|\n#|\n\*\*|$)', '', full_answer, flags=re.IGNORECASE | re.DOTALL)
                full_answer = full_answer.strip()
        
        return JsonResponse({
            "status": "ok",
            "email_data": {
                "subject": email_data['subject'],
                "from": email_data['from'],
                "to": email_data['to'],
                "date": email_data['date'],
                "links": email_data['links'],
                "body": email_data['body'][:500]  # Store body for follow-up questions
            },
            "analysis": full_answer,
            "summary": summary,
            "citations": contexts
        })
    except Exception as e:
        print(f"DEBUG: Email analysis error: {str(e)}")
        return JsonResponse({"error": str(e)}, status=500)

@csrf_exempt
def analyze_image(request):
    """Analyze image/screenshot for phishing/spam indicators"""
    if request.method != "POST":
        return JsonResponse({"error": "POST only"}, status=405)
    try:
        f = request.FILES.get("file")
        if not f:
            return JsonResponse({"error": "file required (multipart/form-data, field name 'file')"}, status=400)
        
        # Extract image metadata
        image_data = extract_text_from_image(f)
        
        # Get user question if provided
        question = request.POST.get("question", "Analyze this image for phishing or spam indicators. Look for suspicious URLs, fake login pages, or other security threats.")
        
        mode = (request.POST.get("mode") or os.getenv("MODE", "LOCAL")).upper()
        
        # Build analysis prompt - include extracted text if available
        extracted_text_section = ""
        if image_data.get('text'):
            extracted_text_section = f"""

Text Extracted from Image (via OCR):
{image_data['text'][:2000]}

"""
        
        # Build analysis prompt
        if question and question != "Analyze this image for phishing or spam indicators. Look for suspicious URLs, fake login pages, or other security threats.":
            analysis_prompt = f"""{question}

Image Details:
- Format: {image_data['format']}
- Dimensions: {image_data['width']}x{image_data['height']}
- Mode: {image_data['mode']}
{extracted_text_section}
Note: {image_data['note']}

Please provide a detailed answer with citations from cybersecurity guidelines."""
        else:
            analysis_prompt = f"""Analyze this image for phishing or spam indicators. Look for suspicious URLs, fake login pages, or other security threats.

Image Details:
- Format: {image_data['format']}
- Dimensions: {image_data['width']}x{image_data['height']}
- Mode: {image_data['mode']}
{extracted_text_section}
Note: {image_data['note']}

IMPORTANT: Start your response with a brief one-line summary in this exact format:
**TL;DR:** [One sentence summary - e.g., "This image shows a suspicious login page that may be a phishing attempt."]

Then provide detailed analysis covering:
1. Phishing/spam indicators found in the text or visual elements
2. Security concerns
3. Recommendations for the user
4. What to look for in similar images

Answer with citations from cybersecurity guidelines."""
        
        # Search knowledge base for relevant context - use extracted text if available
        search_query = question
        if image_data.get('text'):
            # Combine question with extracted text for better context search
            search_query = f"{question} {image_data['text'][:500]}"
        
        contexts = search_similar(search_query, top_k=4)
        
        # Build prompt with context
        prompt = build_prompt(analysis_prompt, contexts)
        
        # Get LLM analysis
        answer = call_openai(prompt) if mode == "CLOUD" else call_ollama(prompt)
        
        # Extract TL;DR summary if present
        summary = ""
        full_answer = answer
        if "**TL;DR:**" in answer or "TL;DR:" in answer:
            import re
            tldr_match = re.search(r'\*\*TL;DR:\*\*\s*(.+?)(?:\n\n|\n#|\n\*\*|$)', answer, re.IGNORECASE | re.DOTALL)
            if not tldr_match:
                tldr_match = re.search(r'TL;DR:\s*(.+?)(?:\n\n|\n#|\n\*\*|$)', answer, re.IGNORECASE | re.DOTALL)
            if tldr_match:
                summary = tldr_match.group(1).strip()
                # Remove TL;DR from main answer
                full_answer = re.sub(r'\*\*TL;DR:\*\*\s*.+?(?=\n\n|\n#|\n\*\*|$)', '', answer, flags=re.IGNORECASE | re.DOTALL)
                full_answer = re.sub(r'TL;DR:\s*.+?(?=\n\n|\n#|\n\*\*|$)', '', full_answer, flags=re.IGNORECASE | re.DOTALL)
                full_answer = full_answer.strip()
        
        return JsonResponse({
            "status": "ok",
            "image_data": {
                "format": image_data['format'],
                "dimensions": f"{image_data['width']}x{image_data['height']}",
                "mode": image_data['mode']
            },
            "analysis": full_answer,
            "summary": summary,
            "citations": contexts
        })
    except Exception as e:
        print(f"DEBUG: Image analysis error: {str(e)}")
        return JsonResponse({"error": str(e)}, status=500)

def landing_page(request):
    """Simple landing page for the API backend"""
    html = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>CyberIntegrity Advisor API</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: #0b1220;
                color: #e6edf3;
                margin: 0;
                padding: 40px 20px;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .container {
                max-width: 600px;
                text-align: center;
                background: linear-gradient(180deg, #0b162c, #0c1426);
                border: 1px solid #1e293b;
                border-radius: 14px;
                padding: 40px;
            }
                    h1 {
                        color: #00d0b0;
                        margin-bottom: 20px;
                        font-size: 2em;
                    }
            .subtitle {
                color: #93a4bf;
                font-size: 1.2em;
                margin-bottom: 30px;
            }
            .api-info {
                background: #0a1326;
                border: 1px solid #1e293b;
                border-radius: 10px;
                padding: 20px;
                margin: 20px 0;
            }
                    .endpoint {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 10px 0;
                        border-bottom: 1px solid #1e293b;
                        gap: 12px;
                    }
                    .endpoint:last-child {
                        border-bottom: none;
                    }
                    .desc {
                        color: #93a4bf;
                        font-size: 0.9em;
                        flex: 1;
                        text-align: right;
                    }
            .method {
                background: #22c55e;
                color: #000;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 0.8em;
                font-weight: bold;
            }
            .url {
                color: #8ed1ff;
                font-family: monospace;
            }
            .frontend-link {
                display: inline-block;
                background: #00d0b0;
                color: #000;
                padding: 12px 24px;
                border-radius: 8px;
                text-decoration: none;
                font-weight: bold;
                margin-top: 20px;
                transition: background 0.2s;
            }
            .frontend-link:hover {
                background: #2dd4bf;
            }
            .status {
                color: #22c55e;
                font-weight: bold;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🔒 CyberIntegrity Advisor API</h1>
            
                    <div class="api-info">
                        <h3>Available Endpoints:</h3>
                        <div class="endpoint">
                            <span class="method">POST</span>
                            <span class="url">/api/ask</span>
                            <span class="desc">Ask cybersecurity questions</span>
                        </div>
                        <div class="endpoint">
                            <span class="method">POST</span>
                            <span class="url">/api/ingest/url</span>
                            <span class="desc">Ingest web content</span>
                        </div>
                        <div class="endpoint">
                            <span class="method">POST</span>
                            <span class="url">/api/ingest/pdf</span>
                            <span class="desc">Upload PDF documents</span>
                        </div>
                        <div class="endpoint">
                            <span class="method">POST</span>
                            <span class="url">/api/integrity</span>
                            <span class="desc">Check similarity/plagiarism</span>
                        </div>
                        <div class="endpoint">
                            <span class="method">POST</span>
                            <span class="url">/api/analyze/email</span>
                            <span class="desc">Analyze email (.eml) for phishing/spam</span>
                        </div>
                        <div class="endpoint">
                            <span class="method">POST</span>
                            <span class="url">/api/analyze/image</span>
                            <span class="desc">Analyze image/screenshot for threats</span>
                        </div>
                    </div>
            
            <p class="status">✅ API Server Running</p>
            <p>This is the backend API server. The user interface is available at:</p>
            
            <a href="http://localhost:3000" class="frontend-link">
                🚀 Open Frontend UI
            </a>
            
            <p style="margin-top: 20px; color: #93a4bf; font-size: 0.9em;">
                Backend: localhost:4555 | Frontend: localhost:3000
            </p>
        </div>
    </body>
    </html>
    """
    return HttpResponse(html)
