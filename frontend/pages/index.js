import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4555';

export default function Home() {
  const [mode, setMode] = useState('LOCAL');
  const [chatMode, setChatMode] = useState('cybersecurity'); // 'cybersecurity' or 'integrity'
  const [messages, setMessages] = useState([
    {
      content: "Hi! I'm CyberIntegrity Advisor with access to OWASP, NIST, and CISA guidelines. Ask me about phishing, passwords, 2FA, or safe browsing. I will answer with citations.",
      meta: "Knowledge base loading • RAG enabled • Citations required",
      who: 'bot'
    }
  ]);
  const [question, setQuestion] = useState('');
  const [url, setUrl] = useState('https://owasp.org/www-project-top-ten/');
          const [knowledgeBase, setKnowledgeBase] = useState([]);
  const [isClient, setIsClient] = useState(false);
          const [evidence, setEvidence] = useState([]);
          const [status, setStatus] = useState('🦙 Llama 3.2');
  const [isLoading, setIsLoading] = useState(false);
          const [integrityText, setIntegrityText] = useState('');
          const [similarityThreshold, setSimilarityThreshold] = useState(0.05);
  const [plagiarismThreshold, setPlagiarismThreshold] = useState(0.3);
          const [integritySummary, setIntegritySummary] = useState('');
          const [integrityTable, setIntegrityTable] = useState('');
          const [pdfFile, setPdfFile] = useState(null);
  const [textareaHeight, setTextareaHeight] = useState(60);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isAnalyzingFile, setIsAnalyzingFile] = useState(false);
  const [fileContext, setFileContext] = useState(null); // Store file data for follow-up questions

  // Save knowledge base to localStorage whenever it changes
  const updateKnowledgeBase = (newKB) => {
    console.log('updateKnowledgeBase called with:', newKB);
    setKnowledgeBase(newKB);
    
    // Use setTimeout to ensure state is updated before saving
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        try {
          const key = 'cyberintegrity-knowledge-base';
          const data = JSON.stringify(newKB);
          localStorage.setItem(key, data);
          console.log('✅ AUTOMATIC SAVE: Saved to localStorage with key:', key);
          console.log('✅ AUTOMATIC SAVE: Data saved:', data);
          
          // Verify it was saved
          const saved = localStorage.getItem(key);
          console.log('✅ AUTOMATIC SAVE: Verification - retrieved from localStorage:', saved);
        } catch (error) {
          console.error('❌ AUTOMATIC SAVE FAILED:', error);
        }
      }
    }, 100);
  };

  const defaultSources = [
    'https://owasp.org/www-project-top-ten/',
    'https://csrc.nist.gov/publications/sp800-63b',
    'https://www.cisa.gov/secure-our-world'
  ];

  useEffect(() => {
    // Set client flag to true after hydration
    setIsClient(true);
    
    // Check for speech recognition support
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      setSpeechSupported(!!SpeechRecognition);
    }
    
    // Load knowledge base from localStorage on client side
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('cyberintegrity-knowledge-base');
        console.log('useEffect - Loading from localStorage:', saved);
        if (saved && saved !== 'undefined' && saved !== 'null') {
          const parsed = JSON.parse(saved);
          console.log('useEffect - Parsed knowledge base:', parsed);
          if (parsed && parsed.length > 0) {
            console.log('useEffect - Setting knowledge base from localStorage:', parsed);
            setKnowledgeBase(parsed);
            return; // Don't run preloadKnowledgeBase if we have data
          }
        }
      } catch (error) {
        console.warn('useEffect - Failed to parse knowledge base:', error);
        localStorage.removeItem('cyberintegrity-knowledge-base');
      }
    }
    
    // Only run preload if no data in localStorage
    preloadKnowledgeBase();
  }, []);

  // Auto-save to localStorage whenever knowledgeBase changes
  useEffect(() => {
    console.log('🔄 AUTO-SAVE useEffect triggered:', { isClient, knowledgeBaseLength: knowledgeBase.length, knowledgeBase });
    if (isClient && typeof window !== 'undefined') {
      try {
        const key = 'cyberintegrity-knowledge-base';
        const data = JSON.stringify(knowledgeBase);
        localStorage.setItem(key, data);
        console.log('🔄 AUTO-SAVE: Saved knowledgeBase to localStorage:', data);
      } catch (error) {
        console.error('🔄 AUTO-SAVE FAILED:', error);
      }
    }
  }, [knowledgeBase, isClient]);

  const preloadKnowledgeBase = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/ask`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          question: "test knowledge base",
          mode: "LOCAL"
        })
      });
      const data = await response.json();

      const sources = data.sources || data.citations || [];
      if(sources && sources.length > 0) {
        setStatus('✓ Knowledge base ready');
        setTimeout(() => setStatus(mode === 'LOCAL' ? '🦙 Llama 3.2' : '☁️ GPT-4o-mini'), 2000);
        return;
      }
    } catch(err) {
      console.log('Knowledge base check failed, proceeding with auto-load...');
    }

    setStatus('Loading knowledge base...');
    let loadedCount = 0;

    for (const url of defaultSources) {
      try {
        const response = await fetch(`${API_BASE}/api/ingest/url`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({url: url})
        });
        const data = await response.json();

        if(data.status === 'ok'){
                  updateKnowledgeBase(prev => [...prev, {url: url, chunks: data.chunks_count || 0}]);
          loadedCount++;
        }
      } catch(err) {
        console.warn(`Failed to load ${url}:`, err);
      }
    }

    setStatus(`✓ Loaded ${loadedCount}/${defaultSources.length} sources`);
    setTimeout(() => setStatus(mode === 'LOCAL' ? '🦙 Llama 3.2' : '☁️ GPT-4o-mini'), 3000);
  };

  const addSource = async () => {
    const u = url.trim();
    if(!u) return;

    setStatus('Ingesting...');
    try {
      const response = await fetch(`${API_BASE}/api/ingest/url`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({url: u})
      });
      const data = await response.json();

      if(data.status === 'ok'){
        console.log('📥 addSource: About to call updateKnowledgeBase with new source');
        updateKnowledgeBase(prev => {
          const newKB = [...prev, {url: u, chunks: data.chunks_count || 0}];
          console.log('📥 addSource: New knowledge base will be:', newKB);
          return newKB;
        });
        setUrl("");
        setStatus(`✓ Ingested ${data.chunks_count} chunks`);
        setTimeout(() => setStatus(mode === 'LOCAL' ? '🦙 Llama 3.2' : '☁️ GPT-4o-mini'), 2000);
      } else {
        setStatus('❌ Ingest failed');
      }
    } catch(err) {
      console.error('Ingest error:', err);
      setStatus('❌ Connection error');
    }
  };

  const uploadPdf = async () => {
    if(!pdfFile) return;

    setStatus('Uploading PDF...');
    try {
      const formData = new FormData();
      formData.append('file', pdfFile);
      
      console.log('Uploading PDF:', pdfFile.name, 'Size:', pdfFile.size, 'Type:', pdfFile.type);

      const response = await fetch(`${API_BASE}/api/ingest/pdf`, {
        method: 'POST',
        body: formData
      });
      
      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);

      if(data.status === 'ok'){
        console.log('📄 uploadPdf: About to call updateKnowledgeBase with new PDF');
        updateKnowledgeBase(prev => {
          const newKB = [...prev, {url: pdfFile.name, chunks: data.chunks_count || 0}];
          console.log('📄 uploadPdf: New knowledge base will be:', newKB);
          return newKB;
        });
        setPdfFile(null);
        setStatus(`✓ Uploaded ${data.chunks_count} chunks from PDF`);
        setTimeout(() => setStatus(mode === 'LOCAL' ? '🦙 Llama 3.2' : '☁️ GPT-4o-mini'), 2000);
      } else {
        setStatus(`❌ PDF upload failed: ${data.error || 'Unknown error'}`);
      }
    } catch(err) {
      console.error('PDF upload error:', err);
      setStatus(`❌ Connection error: ${err.message}`);
    }
  };

  const quick = async (name) => {
    // Map quick names to actual URLs
    const urlMap = {
      'NIST SP 800-63B': 'https://csrc.nist.gov/publications/sp800-63b',
      'OWASP Top 10 2021': 'https://owasp.org/www-project-top-ten/',
      'CISA Phishing Guidance': 'https://www.cisa.gov/secure-our-world'
    };
    
    const url = urlMap[name];
    if (!url) {
      updateKnowledgeBase(prev => [...prev, {url: name, chunks: 0}]);
      return;
    }
    
    setStatus('Ingesting...');
    try {
      const response = await fetch(`${API_BASE}/api/ingest/url`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({url: url})
      });
      const data = await response.json();

      if(data.status === 'ok'){
        updateKnowledgeBase(prev => [...prev, {url: name, chunks: data.chunks_count || 0}]);
        setStatus(`✓ Ingested ${data.chunks_count} chunks from ${name}`);
        setTimeout(() => setStatus(mode === 'LOCAL' ? '🦙 Llama 3.2' : '☁️ GPT-4o-mini'), 2000);
      } else {
        setStatus('❌ Ingest failed');
      }
    } catch(err) {
      console.error('Quick ingest error:', err);
      setStatus('❌ Connection error');
    }
  };

  const clearKnowledgeBase = () => {
    updateKnowledgeBase([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('cyberintegrity-knowledge-base');
    }
    setStatus('Knowledge base cleared');
    setTimeout(() => setStatus(mode === 'LOCAL' ? '🦙 Llama 3.2' : '☁️ GPT-4o-mini'), 2000);
  };

  const removeSource = (index) => {
    const newKB = knowledgeBase.filter((_, i) => i !== index);
    updateKnowledgeBase(newKB);
    setStatus(`Removed source`);
    setTimeout(() => setStatus(mode === 'LOCAL' ? '🦙 Llama 3.2' : '☁️ GPT-4o-mini'), 2000);
  };

  const syncToLocalStorage = () => {
    if (typeof window !== 'undefined') {
      try {
        const data = JSON.stringify(knowledgeBase);
        localStorage.setItem('cyberintegrity-knowledge-base', data);
        console.log('Manually synced to localStorage:', data);
        setStatus(`✓ Saved ${knowledgeBase.length} sources to storage`);
        setTimeout(() => setStatus(mode === 'LOCAL' ? '🦙 Llama 3.2' : '☁️ GPT-4o-mini'), 2000);
      } catch (error) {
        console.warn('Failed to sync to localStorage:', error);
        setStatus('❌ Failed to save to storage');
        setTimeout(() => setStatus(mode === 'LOCAL' ? '🦙 Llama 3.2' : '☁️ GPT-4o-mini'), 2000);
      }
    }
  };

  const handleTextareaChange = (e) => {
    const value = e.target.value;
    setQuestion(value);
    
    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    const maxHeight = 200; // Maximum height before scrolling
    const minHeight = 60; // Minimum height
    
    if (scrollHeight <= maxHeight) {
      textarea.style.height = Math.max(scrollHeight, minHeight) + 'px';
      setTextareaHeight(Math.max(scrollHeight, minHeight));
    } else {
      textarea.style.height = maxHeight + 'px';
      setTextareaHeight(maxHeight);
    }
  };

  const startVoiceInput = () => {
    if (!speechSupported) {
      alert('Speech recognition is not supported in this browser');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    setIsListening(true);
    setStatus('🎤 Listening...');

    recognition.onstart = () => {
      console.log('Speech recognition started');
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      console.log('Speech result:', transcript);
      setQuestion(prev => prev + (prev ? ' ' : '') + transcript);
      setIsListening(false);
      setStatus(mode === 'LOCAL' ? '🦙 Llama 3.2' : '☁️ GPT-4o-mini');
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      setStatus('❌ Speech recognition failed');
      setTimeout(() => setStatus(mode === 'LOCAL' ? '🦙 Llama 3.2' : '☁️ GPT-4o-mini'), 2000);
    };

    recognition.onend = () => {
      setIsListening(false);
      if (status === '🎤 Listening...') {
        setStatus(mode === 'LOCAL' ? '🦙 Llama 3.2' : '☁️ GPT-4o-mini');
      }
    };

    recognition.start();
  };

  const addBubble = (content, who = 'bot', meta = null, summary = null) => {
    setMessages(prev => [...prev, { content, who, meta, summary }]);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Check file type
    const isEmail = file.name.endsWith('.eml') || file.type === 'message/rfc822';
    const isImage = file.type.startsWith('image/');
    
    if (!isEmail && !isImage) {
      alert('Please upload an email file (.eml) or an image file');
      return;
    }
    
    setUploadedFile(file);
  };

  const analyzeFile = async (questionText = null, fileToAnalyze = null) => {
    // Use passed file or fall back to state (for backward compatibility)
    const file = fileToAnalyze || uploadedFile;
    if (!file) return;
    
    const isEmail = file.name.endsWith('.eml') || file.type === 'message/rfc822';
    const endpoint = isEmail ? '/api/analyze/email' : '/api/analyze/image';
    
    setIsAnalyzingFile(true);
    setStatus('Analyzing file...');
    
    // Use provided question text or fall back to state
    // If questionText is explicitly passed (even if empty string), use it; otherwise use state
    const userQuestion = questionText !== null && questionText !== undefined ? questionText : question.trim();
    
    console.log('analyzeFile - questionText:', questionText, 'userQuestion:', userQuestion, 'question state:', question);
    
    // Always show the file first
    addBubble(`📎 Uploaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`, 'user');
    
    // If there's a question, show it as a separate user message
    if (userQuestion && userQuestion.length > 0) {
      console.log('Adding question bubble:', userQuestion);
      addBubble(userQuestion, 'user');
    }
    
    addBubble('<div class="loading-dots">🔍 Analyzing for phishing/spam threats...</div>', 'bot');
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', mode);
      
      // Add question if user provided one
      if (userQuestion) {
        formData.append('question', userQuestion);
      }
      
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (data.status === 'ok' && data.analysis) {
        // Remove loading bubble
        setMessages(prev => prev.slice(0, -1));
        
        // Store file context for follow-up questions
        if (isEmail && data.email_data) {
          setFileContext({
            type: 'email',
            subject: data.email_data.subject,
            from: data.email_data.from,
            body: data.email_data.body || '',
            links: data.email_data.links || []
          });
        } else if (!isEmail && data.image_data) {
          setFileContext({
            type: 'image',
            format: data.image_data.format,
            dimensions: data.image_data.dimensions,
            mode: data.image_data.mode
          });
        }
        
        // Show analysis (summary will be displayed separately if available)
        const sources = data.citations || [];
        addBubble(data.analysis, 'bot', `Mode: ${mode} • ${sources.length} sources`, data.summary);
        
        // Show file metadata as markdown
        if (isEmail && data.email_data) {
          const emailInfo = `\n\n---\n\n**Email Details:**\n- **From:** ${data.email_data.from || 'N/A'}\n- **Subject:** ${data.email_data.subject || 'N/A'}\n${data.email_data.links && data.email_data.links.length > 0 ? `- **Links:** ${data.email_data.links.join(', ')}` : ''}`;
          setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            return [...prev.slice(0, -1), { ...lastMsg, content: lastMsg.content + emailInfo }];
          });
        } else if (!isEmail && data.image_data) {
          const imageInfo = `\n\n---\n\n**Image Details:**\n- **Format:** ${data.image_data.format}\n- **Dimensions:** ${data.image_data.dimensions}`;
          setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            return [...prev.slice(0, -1), { ...lastMsg, content: lastMsg.content + imageInfo }];
          });
        }
        
        // Update evidence - show all unique citations (deduplicate by URL+text combination, not just URL)
        if (sources && sources.length > 0) {
          // Deduplicate by URL + text hash to show multiple chunks from same source
          // Use more text (first 200 chars) to better distinguish different chunks
          const uniqueEvidence = sources.reduce((acc, source) => {
            const textHash = (source.text || '').substring(0, 200).trim();
            const key = `${source.url || 'no-url'}-${textHash}`;
            const existingIndex = acc.findIndex(item => {
              const itemTextHash = (item.text || '').substring(0, 200).trim();
              const itemKey = `${item.url || 'no-url'}-${itemTextHash}`;
              return itemKey === key;
            });
            if (existingIndex === -1) {
              acc.push(source);
            } else {
              // Keep the one with higher score if duplicate
              if (source.score > acc[existingIndex].score) {
                acc[existingIndex] = source;
              }
            }
            return acc;
          }, []);
          // Sort by score (highest first) and limit to top 10 for display
          const sortedEvidence = uniqueEvidence
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .slice(0, 10);
          setEvidence(sortedEvidence);
        } else {
          setEvidence([]);
        }
        
        setStatus(mode === 'LOCAL' ? '🦙 Llama 3.2' : '☁️ GPT-4o-mini');
        // Ensure file preview is cleared after response (in case it somehow got set again)
        setUploadedFile(null);
        // File context is set above for follow-up questions
        // Don't clear question here - it's already been used and displayed
      } else {
        setMessages(prev => prev.slice(0, -1));
        addBubble('❌ Error: ' + (data.error || 'Unknown error'), 'bot');
        setStatus('❌ Error');
        // Clear file preview on error too
        setUploadedFile(null);
      }
    } catch (err) {
      console.error('File analysis error:', err);
      setMessages(prev => prev.slice(0, -1));
      addBubble('❌ Connection error. Make sure backend is running on port 4555.', 'bot');
      setStatus('❌ Connection error');
      // Clear file preview on connection error too
      setUploadedFile(null);
    } finally {
      setIsAnalyzingFile(false);
    }
  };

  const send = async () => {
    const text = question.trim();
    
    console.log('send() called - text:', text, 'uploadedFile:', uploadedFile, 'question state:', question);
    
    // If there's a file uploaded, analyze it (with optional question)
    if (uploadedFile) {
      console.log('Calling analyzeFile with text:', text);
      // Clear file preview immediately (like ChatGPT) - before calling analyzeFile
      const fileToAnalyze = uploadedFile;
      setUploadedFile(null); // Clear immediately so preview disappears right away
      // Clear question AFTER capturing it
      const questionToUse = text;
      setQuestion(""); // Clear it now so it doesn't interfere
      // Update analyzeFile to use the passed file instead of state
      analyzeFile(questionToUse, fileToAnalyze); // Pass both question and file
      return;
    }
    
    // If there's file context but no file, allow asking questions about it
    if (!text && !fileContext) return;
    
    if(!text && fileContext) {
      // If no question but file context exists, prompt user
      return;
    }

    addBubble(text, 'user');
    setQuestion("");
    setTextareaHeight(60); // Reset textarea height
    setIsLoading(true);
    setStatus('Thinking...');

    // Add a loading bubble immediately
    addBubble('<div class="loading-dots">🤖 AI is thinking...</div>', 'bot');

    try {
      // Include file context if available (for follow-up questions)
      const requestBody = {
        question: text,
        mode: mode,
        top_k: 8  // Request more citations to get multiple evidence items
      };
      
      if (fileContext) {
        requestBody.file_context = fileContext;
      }
      
      const response = await fetch(`${API_BASE}/api/ask`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(requestBody)
      });
      const data = await response.json();

      if(data.answer){
        // Remove the loading bubble and add the actual response
        setMessages(prev => prev.slice(0, -1)); // Remove last message (loading bubble)
        
        const sources = data.sources || data.citations || [];
        // Summary will be displayed separately if available
        addBubble(data.answer, 'bot', `Mode: ${mode} • ${sources.length} sources`, data.summary);

        if(sources && sources.length > 0){
          // Show multiple evidence items - deduplicate by URL+text combination to allow multiple chunks from same source
          // Use more text (first 200 chars) to better distinguish different chunks
          const uniqueEvidence = sources.reduce((acc, source) => {
            const textHash = (source.text || '').substring(0, 200).trim();
            const key = `${source.url || 'no-url'}-${textHash}`;
            const existingIndex = acc.findIndex(item => {
              const itemTextHash = (item.text || '').substring(0, 200).trim();
              const itemKey = `${item.url || 'no-url'}-${itemTextHash}`;
              return itemKey === key;
            });
            if (existingIndex === -1) {
              // New unique citation, add it
              acc.push(source);
            } else {
              // Duplicate found, keep the one with higher score
              if (source.score > acc[existingIndex].score) {
                acc[existingIndex] = source;
              }
            }
            return acc;
          }, []);
          // Sort by score (highest first) and limit to top 10 for display
          const sortedEvidence = uniqueEvidence
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .slice(0, 10);
          setEvidence(sortedEvidence);
        } else {
          setEvidence([]);
        }

        setStatus(mode === 'LOCAL' ? '🦙 Llama 3.2' : '☁️ GPT-4o-mini');
        setIsLoading(false);
      } else {
        // Remove the loading bubble and add error
        setMessages(prev => prev.slice(0, -1)); // Remove last message (loading bubble)
        addBubble('❌ Error: ' + (data.error || 'Unknown error'), 'bot');
        setStatus('❌ Error');
        setIsLoading(false);
      }
    } catch(err) {
      console.error('Ask error:', err);
      // Remove the loading bubble and add error
      setMessages(prev => prev.slice(0, -1)); // Remove last message (loading bubble)
      addBubble('❌ Connection error. Make sure backend is running on port 4555.', 'bot');
      setStatus('❌ Connection error');
      setIsLoading(false);
    }
  };

  const runIntegrity = async () => {
    const text = integrityText.trim();
    const simThr = parseFloat(similarityThreshold);
    const plagThr = parseFloat(plagiarismThreshold);
    if(!text){
      setIntegritySummary('<span class="muted">Paste some text to check.</span>');
      setIntegrityTable('');
      return;
    }
    
    try {
      setIntegritySummary('<span class="muted">Checking integrity...</span>');
      
      const response = await fetch(`${API_BASE}/api/integrity`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          text: text,
          similarity_threshold: simThr,
          plagiarism_threshold: plagThr,
          top_k: 10
        })
      });
      
      const data = await response.json();
      
      if (data.error) {
        setIntegritySummary(`<span style="color:var(--bad)">Error: ${data.error}</span>`);
        return;
      }
      
      const score = data.overall_score;
      const color = score > 50 ? 'var(--bad)' : score > 20 ? '#eab308' : 'var(--ok)';
      const statusColor = data.status === 'high_risk' ? 'var(--bad)' : 
                          data.status === 'medium_risk' ? '#eab308' : 'var(--ok)';
      
      setIntegritySummary(`
        <div class="row" style="align-items:center;gap:10px;margin-bottom:8px">
          <div><b>Overall Risk:</b> <span class="pct" style="color:${color}">${score}%</span></div>
          <span class="badge" style="background:${statusColor === 'var(--bad)' ? '#3b2a07' : statusColor === '#eab308' ? '#3b2a07' : '#052e2b'}; color:${statusColor === 'var(--bad)' ? '#fde68a' : statusColor === '#eab308' ? '#fde68a' : '#9ff3e5'}">${data.status.replace('_', ' ').toUpperCase()}</span>
        </div>
        <div class="row" style="gap:16px;margin-bottom:8px">
          <div><b>Similarity:</b> <span style="color:${data.similarity_score > 50 ? 'var(--bad)' : data.similarity_score > 20 ? '#eab308' : 'var(--ok)'}">${data.similarity_score}%</span></div>
          <div><b>Plagiarism:</b> <span style="color:${data.plagiarism_score > 50 ? 'var(--bad)' : data.plagiarism_score > 20 ? '#eab308' : 'var(--ok)'}">${data.plagiarism_score}%</span></div>
        </div>
        <div class="meter" style="margin-top:6px"><div style="width:${score}%"></div></div>
        <div class="small" style="margin-top:6px">Similarity: ${data.similarity_matches} matches • Plagiarism: ${data.plagiarism_matches} matches</div>
      `);

      if (data.matches && data.matches.length > 0) {
        const rows = data.matches.map((match, i) => {
          const isPlagiarism = match.type === 'plagiarism';
          const score = isPlagiarism ? match.plagiarism_score : match.similarity;
          const scoreColor = isPlagiarism ? 
            (match.severity === 'high' ? 'var(--bad)' : match.severity === 'medium' ? '#eab308' : 'var(--ok)') :
            (score > 0.7 ? 'var(--bad)' : score > 0.5 ? '#eab308' : 'var(--ok)');
          
          return `
            <tr style="background:${isPlagiarism ? '#2a1a0a' : '#0a1a2a'}">
              <td>${i+1}</td>
              <td>${match.content}</td>
              <td><a class="srcurl" href="${match.url}" target="_blank">${match.source}</a></td>
              <td><span style="color:${scoreColor}">${score.toFixed(3)}</span></td>
              <td>
                ${isPlagiarism ? 
                  `<span style="color:var(--bad)">⚠️ PLAGIARISM (${match.severity.toUpperCase()})</span>` : 
                  `<span style="color:#eab308">📊 Similarity ${match.needs_citation ? '— needs citation' : ''}</span>`
                }
              </td>
            </tr>
          `;
        }).join("");

        setIntegrityTable(`
          <table>
            <thead><tr><th>#</th><th>Matched Passage</th><th>Source</th><th>Score</th><th>Type</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="hint" style="margin-top:6px">
            🔍 <strong>Analysis:</strong> ${data.analysis.has_plagiarism ? '⚠️ Plagiarism detected' : '✅ No plagiarism'} • 
            ${data.analysis.has_similarity ? '📊 Similarity found' : '✅ No similarity'} • 
            ${data.analysis.plagiarism_severity !== 'none' ? `Severity: ${data.analysis.plagiarism_severity.toUpperCase()}` : 'Clean content'}
          </div>
        `);
      } else {
        setIntegrityTable(`
          <div class="muted">✅ No significant similarity or plagiarism detected above threshold ${thr.toFixed(2)}</div>
        `);
      }
      
    } catch (error) {
      setIntegritySummary(`<span style="color:var(--bad)">Connection error: ${error.message}</span>`);
      setIntegrityTable('');
    }
  };

  return (
    <>
      <style jsx global>{`
        :root {
          --bg:#0b1220; --bg2:#0f172a; --panel:#0b162c; --muted:#93a4bf; --text:#e6edf3;
          --line:#1e293b; --brand:#00d0b0; --accent:#2dd4bf; --chip:#172554; --warn:#fbbf24; --ok:#22c55e; --bad:#ef4444;
        }
        *{box-sizing:border-box} 
        html,body{height:100%; margin:0; padding:0}
        body{background:var(--bg);color:var(--text);font-family:Inter,system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
        .app{display:grid;grid-template-rows:auto 1fr;min-height:100vh}
        header{display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,var(--bg2),transparent)}
        header .title{font-weight:700;letter-spacing:.2px}
        .pill{border:1px solid var(--line);padding:4px 10px;border-radius:999px;font-size:12px;background:var(--chip);color:#c7d2fe}
        .brand{color:var(--brand)}
        .container{display:grid;grid-template-columns:260px 1fr 380px;gap:16px;padding:16px;height:calc(100vh - 80px);position:relative}
        .panel{background:linear-gradient(180deg,var(--panel),#0c1426);border:1px solid var(--line);border-radius:14px;overflow:hidden;height:100%;display:flex;flex-direction:column}
        .panel h3{margin:16px;font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#9fb3d9}
        .panel .body{padding:12px 16px;flex:1;overflow-y:auto}
        .muted{color:var(--muted)}
        .btn{border:1px solid var(--line);background:#0c1730;color:var(--text);padding:10px 12px;border-radius:10px;cursor:pointer}
        .btn:hover{border-color:#314561}
        input,textarea{width:100%;border:1px solid var(--line);background:#0a1326;color:var(--text);padding:10px 12px;border-radius:10px;outline:none}
        input::placeholder, textarea::placeholder{color:#5b6a86}
        .chiprow{display:flex;flex-wrap:wrap;gap:6px}
        .chipbtn{background:#0c1a34;border:1px solid var(--line);color:#c7d2fe;padding:6px 10px;border-radius:999px;font-size:12px;cursor:pointer}
        .chipbtn:hover{border-color:#324560}
        .chat{display:flex;flex-direction:column;height:100%;position:relative}
        .messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;padding-bottom:120px;min-height:0}
        .bubble{max-width:80%;padding:12px 14px;border-radius:14px;border:1px solid var(--line);box-shadow:0 0 0 1px rgba(0,0,0,.08) inset}
        .u{align-self:flex-end;background:#101b33}
        .b{align-self:flex-start;background:#0b1c2e}
        .meta{font-size:12px;color:#9fb3d9;margin-top:6px}
                .composer{padding:12px;border-top:1px solid var(--line);display:flex;gap:8px;position:absolute;bottom:0;left:0;right:0;background:var(--panel);z-index:10;border-radius:0 0 14px 14px;align-items:flex-end}
        .w100{flex:1}
        .row{display:flex;gap:8px;align-items:center}
        .split{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .source{border:1px solid var(--line);background:#0b1a2f;border-radius:10px;padding:10px;margin-bottom:10px}
        .source .srcurl{color:#8ed1ff;text-decoration:none}
        .source .tag{display:inline-block;background:#0e223f;color:#cfe5ff;border:1px solid #1a3b69;padding:2px 8px;border-radius:999px;font-size:11px;margin-right:6px}
        .mode{margin-left:auto;display:flex;gap:8px;align-items:center}
        .toggle{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:2px;gap:2px}
        .toggle button{background:transparent;border:0;color:var(--text);padding:6px 10px;border-radius:999px;font-size:12px;cursor:pointer}
        .toggle button.active{background:#12325a}
        .badge{display:inline-block;background:#052e2b;border:1px solid #0b544e;color:#9ff3e5;padding:2px 8px;border-radius:999px;font-size:12px}
        .hint{font-size:12px;color:#97a8c6;margin-top:6px}
        .kbd{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#111827;border:1px solid #22324a;padding:2px 6px;border-radius:6px}
        .pill-warn{background:#3b2a07;color:#fde68a;border:1px solid #6b4f0d}
        .small{font-size:11px;color:#8b9bb0}
        .pct{font-weight:600}
        .meter{height:6px;background:#0a1326;border-radius:999px;overflow:hidden}
        .meter div{height:100%;background:linear-gradient(90deg,var(--ok),#eab308,var(--bad));transition:width .3s}
        table{width:100%;border-collapse:collapse;font-size:12px}
        table th,table td{padding:8px;text-align:left;border-bottom:1px solid var(--line)}
        table th{background:#0a1326;color:#9fb3d9;font-weight:600}
        .srcurl{color:#8ed1ff;text-decoration:none}
        .srcurl:hover{text-decoration:underline}
        .loading-dots{display:flex;align-items:center;gap:8px;color:#93a4bf;font-style:italic}
        .loading-dots::after{content:'';width:4px;height:4px;background:#00d0b0;border-radius:50%;animation:loading 1.4s infinite ease-in-out both}
        .loading-dots::before{content:'';width:4px;height:4px;background:#00d0b0;border-radius:50%;animation:loading 1.4s infinite ease-in-out both;animation-delay:-0.16s}
        @keyframes loading{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}
        .markdown-content{line-height:1.6;color:var(--text)}
        .markdown-content h1,.markdown-content h2,.markdown-content h3,.markdown-content h4{font-weight:600;margin-top:16px;margin-bottom:8px;color:var(--text)}
        .markdown-content h1{font-size:1.5em;border-bottom:1px solid var(--line);padding-bottom:8px}
        .markdown-content h2{font-size:1.3em}
        .markdown-content h3{font-size:1.1em}
        .markdown-content p{margin:8px 0;line-height:1.7}
        .markdown-content strong{font-weight:600;color:var(--text)}
        .markdown-content em{font-style:italic}
        .markdown-content ul,.markdown-content ol{margin:8px 0;padding-left:24px}
        .markdown-content li{margin:4px 0;line-height:1.6}
        .markdown-content ul li{list-style-type:disc}
        .markdown-content ol li{list-style-type:decimal}
        .markdown-content code{background:rgba(0,208,176,0.15);color:#00d0b0;padding:2px 6px;border-radius:4px;font-size:0.9em;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
        .markdown-content pre{background:#0a1326;border:1px solid var(--line);border-radius:8px;padding:12px;overflow-x:auto;margin:12px 0}
        .markdown-content pre code{background:transparent;color:var(--text);padding:0}
        .markdown-content blockquote{border-left:3px solid rgba(0,208,176,0.5);padding-left:16px;margin:12px 0;color:var(--muted);font-style:italic}
        .markdown-content a{color:#8ed1ff;text-decoration:none}
        .markdown-content a:hover{text-decoration:underline}
        .markdown-content hr{border:none;border-top:1px solid var(--line);margin:16px 0}
      `}</style>
      <div className="app">
      
      <header>
        <div className="title">🔒 <span className="brand">CyberIntegrity Advisor</span></div>
        <span className="pill">RAG</span>
        <span className="pill">Citations</span>
        <span className="pill pill-warn">Integrity Check</span>
        <div className="mode">
          <span className="muted">Chat Mode</span>
          <div className="toggle">
            <button 
              className={chatMode === 'cybersecurity' ? 'active' : ''} 
              onClick={() => setChatMode('cybersecurity')}
            >
              Cybersecurity
            </button>
            <button 
              className={chatMode === 'integrity' ? 'active' : ''} 
              onClick={() => setChatMode('integrity')}
            >
              Integrity Check
            </button>
          </div>
        </div>
        <div className="mode" style={{marginLeft: '16px'}}>
          <span className="muted">LLM Mode</span>
          <div className="toggle">
            <button 
              className={mode === 'LOCAL' ? 'active' : ''} 
              onClick={() => setMode('LOCAL')}
            >
              Local
            </button>
            <button 
              className={mode === 'CLOUD' ? 'active' : ''} 
              onClick={() => setMode('CLOUD')}
            >
              Cloud
            </button>
          </div>
          <span className="badge">{status}</span>
        </div>
      </header>

      <div className="container">
        {/* Left: Docs / Ingest */}
                <aside className="panel">
                  <h3>Knowledge Base</h3>
                  <div className="body">
                    <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                      <input 
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://owasp.org/www-project-top-ten/"
                        style={{width: '100%'}}
                      />
                      <button className="btn" onClick={addSource} style={{width: '100%'}}>Ingest URL</button>
                    </div>
                    <div className="hint">Tip: Add NIST / OWASP / CERT pages. Demo stores locally only.</div>
                    
                    <hr style={{borderColor:'var(--line)',margin:'14px 0'}} />
                    
                    <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                      <div style={{
                        border: '2px dashed var(--line)',
                        borderRadius: '8px',
                        padding: '12px',
                        textAlign: 'center',
                        background: 'var(--chip)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        borderColor: pdfFile ? '#14b8a6' : 'var(--line)',
                        background: pdfFile ? 'linear-gradient(135deg, #0f766e, #14b8a6)' : 'var(--chip)'
                      }}
                      onClick={() => document.getElementById('pdf-upload').click()}
                      >
                        <input 
                          id="pdf-upload"
                          type="file"
                          accept=".pdf"
                          onChange={(e) => setPdfFile(e.target.files[0])}
                          style={{display: 'none'}}
                        />
                        <div style={{
                          color: pdfFile ? '#f0fdfa' : 'var(--text)', 
                          fontSize: '14px', 
                          fontWeight: '500',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '100%'
                        }}>
                          {pdfFile ? `📄 ${pdfFile.name}` : '📁 Choose PDF file or drag & drop'}
                        </div>
                        <div style={{color: pdfFile ? '#a7f3d0' : 'var(--muted)', fontSize: '12px', marginTop: '4px'}}>
                          {pdfFile ? `${(pdfFile.size / 1024 / 1024).toFixed(1)} MB` : 'Supported: .pdf files'}
                        </div>
                      </div>
                      <button 
                        className="btn" 
                        onClick={uploadPdf}
                        disabled={!pdfFile}
                        style={{
                          background: pdfFile ? 'linear-gradient(135deg, #3b2a07, #6b4f0d)' : 'var(--chip)',
                          color: pdfFile ? '#fde68a' : 'var(--muted)',
                          border: pdfFile ? '1px solid #6b4f0d' : '1px solid var(--line)',
                          cursor: pdfFile ? 'pointer' : 'not-allowed',
                          width: '100%',
                          fontSize: '14px',
                          fontWeight: '600'
                        }}
                      >
                        {pdfFile ? '📤 Upload PDF' : '📤 No file selected'}
                      </button>
                    </div>
            <hr style={{borderColor:'var(--line)',margin:'14px 0'}} />
            <div className="chiprow">
              <button className="chipbtn" onClick={() => quick('NIST SP 800-63B')}>NIST SP 800-63B</button>
              <button className="chipbtn" onClick={() => quick('OWASP Top 10 2021')}>OWASP Top 10</button>
              <button className="chipbtn" onClick={() => quick('CISA Phishing Guidance')}>CISA Phishing</button>
            </div>
            <div style={{marginTop:'10px'}} className="muted">
              {knowledgeBase.length === 0 ? 'No documents ingested yet.' : 
                knowledgeBase.map((x, i) => (
                  <div key={i} style={{
                    display: 'flex', 
                    alignItems: 'flex-start', 
                    justifyContent: 'space-between', 
                    marginBottom: '8px', 
                    padding: '8px', 
                    background: 'var(--chip)', 
                    borderRadius: '8px',
                    gap: '8px'
                  }}>
                    <div style={{flex: 1, minWidth: 0}}>
                      <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px'}}>
                        <span>•</span>
                        <div style={{
                          fontSize: '12px',
                          wordBreak: 'break-word',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {x.url.startsWith('http') ? 
                            <a href={x.url} className="srcurl" target="_blank">{x.url}</a> : 
                            <span>{x.url}</span>
                          }
                        </div>
                      </div>
                      <div className="small" style={{marginLeft: '16px', color: 'var(--muted)'}}>
                        {x.chunks} chunks
                      </div>
                    </div>
                    <button 
                      onClick={() => removeSource(i)}
                      style={{
                        background: 'linear-gradient(135deg, #7c2d12, #dc2626)',
                        border: '1px solid #dc2626',
                        color: '#fef2f2',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        cursor: 'pointer',
                        minWidth: '20px',
                        height: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                      title="Remove this source"
                    >
                      ×
                    </button>
                  </div>
                ))
              }
            </div>
            <div style={{display: 'flex', gap: '8px', marginTop: '10px'}}>
              {knowledgeBase.length > 0 && (
                <button 
                  className="btn" 
                  onClick={clearKnowledgeBase}
                  style={{
                    background: 'linear-gradient(135deg, #7c2d12, #dc2626)',
                    border: '1px solid #dc2626',
                    color: '#fef2f2',
                    fontSize: '12px',
                    padding: '8px 12px',
                    flex: 1
                  }}
                >
                  🗑️ Clear All
                </button>
              )}
              <button 
                className="btn" 
                onClick={syncToLocalStorage}
                style={{
                  background: 'linear-gradient(135deg, #0f766e, #14b8a6)',
                  border: '1px solid #14b8a6',
                  color: '#f0fdfa',
                  fontSize: '12px',
                  padding: '8px 12px',
                  fontWeight: '600'
                }}
              >
                💾 Save
              </button>
            </div>
          </div>
        </aside>

        {/* Middle: Chat */}
        <section className="panel chat">
          <div className="messages" style={{ paddingBottom: (uploadedFile || fileContext) && chatMode === 'cybersecurity' ? '210px' : '120px' }}>
            {chatMode === 'cybersecurity' ? (
              messages.map((msg, i) => (
                <div key={i} className={`bubble ${msg.who === 'user' ? 'u' : 'b'}`}>
                  {msg.who === 'bot' && msg.summary && (
                    <div style={{
                      padding: '14px 18px',
                      background: 'linear-gradient(135deg, rgba(0, 208, 176, 0.2), rgba(0, 208, 176, 0.1))',
                      border: '2px solid rgba(0, 208, 176, 0.5)',
                      borderRadius: '10px',
                      marginBottom: '16px',
                      fontSize: '15px',
                      fontWeight: '600',
                      color: '#00d0b0',
                      lineHeight: '1.6',
                      boxShadow: '0 2px 8px rgba(0, 208, 176, 0.2)'
                    }}>
                      💡 {msg.summary}
                    </div>
                  )}
                  {msg.who === 'bot' ? (
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      className="markdown-content"
                    >
                      {msg.content.replace(/<[^>]*>/g, '')}
                    </ReactMarkdown>
                  ) : (
                    <div>{msg.content.replace(/<[^>]*>/g, '')}</div>
                  )}
                  {msg.meta && <div className="meta">{msg.meta}</div>}
                </div>
              ))
            ) : (
              <div className="bubble b">
                <div>
                  <strong>Integrity Check Mode</strong><br/>
                  Paste any text below to check for similarity/plagiarism against your knowledge base. 
                  The system will analyze the text and show you potential matches with similarity scores.
                </div>
                <div className="meta">Real-time integrity checking • Vector similarity search</div>
              </div>
            )}
          </div>
          {/* File context indicator - shows when file context is available for follow-up questions */}
          {chatMode === 'cybersecurity' && fileContext && !uploadedFile && (
            <div style={{
              position: 'absolute',
              bottom: '100px',
              left: '12px',
              right: '12px',
              padding: '8px 12px',
              background: 'rgba(251, 191, 36, 0.15)',
              border: '1px solid rgba(251, 191, 36, 0.4)',
              borderRadius: '8px',
              fontSize: '12px',
              color: 'var(--text)',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px'
            }}>
              <span>
                📎 {fileContext.type === 'email' ? `Email context available: "${fileContext.subject || 'Untitled'}"` : `Image context available`}
              </span>
              <button
                onClick={() => setFileContext(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  fontSize: '16px',
                  padding: '0 4px'
                }}
                title="Clear file context"
              >
                ×
              </button>
            </div>
          )}
          {/* File preview above composer - like ChatGPT */}
          {chatMode === 'cybersecurity' && uploadedFile && (
            <div style={{
              position: 'absolute',
              bottom: '100px',
              left: '12px',
              right: '12px',
              padding: '10px 14px',
              background: 'rgba(0, 208, 176, 0.15)',
              border: '1px solid rgba(0, 208, 176, 0.4)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '13px',
              zIndex: 10,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              marginBottom: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '18px' }}>📎</span>
                <span style={{ 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  whiteSpace: 'nowrap',
                  flex: 1,
                  fontWeight: '500'
                }}>
                  {uploadedFile.name}
                </span>
                <span style={{ color: 'var(--muted)', fontSize: '11px', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                  ({(uploadedFile.size / 1024).toFixed(1)} KB)
                </span>
              </div>
              <button
                        onClick={() => {
                          setUploadedFile(null);
                          // Keep fileContext for follow-up questions
                        }}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  fontSize: '20px',
                  padding: '0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  transition: 'background 0.2s',
                  marginLeft: '12px'
                }}
                onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.2)'}
                onMouseLeave={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.1)'}
                title="Remove file"
              >
                ×
              </button>
            </div>
          )}
                  <div className="composer">
                    {chatMode === 'cybersecurity' ? (
                      <>
                        <textarea 
                          className="w100"
                          value={question}
                          onChange={handleTextareaChange}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              send();
                            }
                          }}
                          placeholder={uploadedFile ? "Add a question about the file (optional)..." : fileContext ? "Ask a follow-up question about the uploaded file..." : "Ask a cybersecurity question… e.g., 'Is this email a phishing attempt?'"}
                          style={{
                            resize: 'none',
                            height: `${textareaHeight}px`,
                            fontFamily: 'inherit',
                            lineHeight: '1.5',
                            overflow: textareaHeight >= 200 ? 'auto' : 'hidden',
                            minHeight: '60px',
                            maxHeight: '200px'
                          }}
                        />
                        <input
                          type="file"
                          id="file-upload"
                          accept=".eml,image/*"
                          onChange={handleFileUpload}
                          style={{ display: 'none' }}
                        />
                        <button
                          className="btn"
                          onClick={() => document.getElementById('file-upload').click()}
                          disabled={isLoading || isAnalyzingFile}
                          style={{
                            background: uploadedFile ? 'rgba(0, 208, 176, 0.2)' : 'var(--chip)',
                            border: uploadedFile ? '1px solid rgba(0, 208, 176, 0.5)' : '1px solid var(--line)',
                            cursor: (isLoading || isAnalyzingFile) ? 'not-allowed' : 'pointer',
                            opacity: (isLoading || isAnalyzingFile) ? 0.6 : 1,
                            height: '60px',
                            minHeight: '60px',
                            maxHeight: '60px',
                            alignSelf: 'flex-end',
                            marginBottom: '0px',
                            minWidth: '60px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '20px'
                          }}
                          title="Upload email (.eml) or image"
                        >
                          📎
                        </button>
                        {speechSupported && (
                          <button 
                            className="btn" 
                            onClick={startVoiceInput}
                            disabled={isListening || isLoading || isAnalyzingFile}
                            style={{
                              background: isListening ? '#ef4444' : 'var(--chip)',
                              cursor: (isListening || isLoading || isAnalyzingFile) ? 'not-allowed' : 'pointer',
                              opacity: (isListening || isLoading || isAnalyzingFile) ? 0.6 : 1,
                              height: '60px',
                              minHeight: '60px',
                              maxHeight: '60px',
                              alignSelf: 'flex-end',
                              marginBottom: '0px',
                              minWidth: '60px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            title={isListening ? 'Listening...' : 'Voice input'}
                          >
                            {isListening ? '🎤' : '🎙️'}
                          </button>
                        )}
                        <button 
                          className="btn" 
                          onClick={send}
                          disabled={isLoading || isAnalyzingFile}
                          style={{
                            background: (isLoading || isAnalyzingFile) ? 'var(--muted)' : uploadedFile ? 'rgba(0, 208, 176, 0.3)' : 'var(--chip)',
                            cursor: (isLoading || isAnalyzingFile) ? 'not-allowed' : 'pointer',
                            opacity: (isLoading || isAnalyzingFile) ? 0.6 : 1,
                            height: '60px',
                            minHeight: '60px',
                            maxHeight: '60px',
                            alignSelf: 'flex-end',
                            marginBottom: '0px'
                          }}
                        >
                          {isAnalyzingFile ? 'Analyzing...' : isLoading ? 'Thinking...' : uploadedFile ? 'Analyze File' : 'Ask'}
                        </button>
              </>
                    ) : (
                      <>
                        <div style={{display: 'flex', flexDirection: 'column', gap: '12px', width: '100%'}}>
                          <textarea 
                            className="w100"
                            rows="4"
                            value={integrityText}
                            onChange={(e) => setIntegrityText(e.target.value)}
                            placeholder="Paste any text to check for similarity/plagiarism…"
                            style={{resize: 'vertical', minHeight: '100px', width: '100%'}}
                          />
                          <div style={{display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between'}}>
                            <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                              <span className="muted" style={{fontSize: '12px'}}>Similarity:</span>
                              <input 
                                type="number" 
                                min="0.01" 
                                max="0.99" 
                                step="0.01" 
                                value={similarityThreshold}
                                onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
                                title="Similarity threshold"
                                style={{width: '60px', fontSize: '12px'}}
                              />
                              <span className="muted" style={{fontSize: '12px'}}>Plagiarism:</span>
                              <input 
                                type="number" 
                                min="0.01" 
                                max="0.99" 
                                step="0.01" 
                                value={plagiarismThreshold}
                                onChange={(e) => setPlagiarismThreshold(parseFloat(e.target.value))}
                                title="Plagiarism threshold"
                                style={{width: '60px', fontSize: '12px'}}
                              />
                            </div>
                            <button 
                              className="btn" 
                              onClick={runIntegrity} 
                              style={{
                                background: 'linear-gradient(135deg, #3b2a07, #6b4f0d)',
                                border: '1px solid #6b4f0d',
                                color: '#fde68a',
                                fontWeight: '600',
                                fontSize: '13px',
                                padding: '12px 20px',
                                borderRadius: '8px',
                                minWidth: '200px'
                              }}
                            >
                              Check Integrity (Similarity / Plagiarism)
                            </button>
                          </div>
                        </div>
                      </>
                    )}
          </div>
        </section>

        {/* Right: Sources / Citations + Integrity */}
        <aside className="panel">
          <div className="body" style={{padding: '0', height: '100%', overflowY: 'auto'}}>
            <div style={{padding: '16px'}}>
              <h3 style={{margin: '0 0 16px 0', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '.08em', color: '#9fb3d9'}}>Answer Evidence</h3>
              {evidence.length === 0 ? 
                <div className="muted">Citations tied to the latest answer will appear here.</div> :
                evidence.map((s, i) => (
                  <div key={i} className="source">
                    <div className="srcurl" style={{fontWeight: '600', color: '#00d0b0'}}>
                      {(() => {
                        // Try to extract a meaningful title from the URL or text
                        if (s.url) {
                          if (s.url.includes('nist.gov') && s.url.includes('800-63')) {
                            return 'NIST SP 800-63B §5.1.1';
                          } else if (s.url.includes('owasp.org') && s.url.includes('application-security-verification')) {
                            return 'OWASP ASVS 4.0 §2.1';
                          } else if (s.url.includes('cisa.gov')) {
                            return 'CISA Secure Our World';
                          } else if (s.url.includes('owasp.org') && s.url.includes('top-ten')) {
                            return 'OWASP Top 10 2021';
                          } else {
                            // Extract domain name as fallback
                            const domain = s.url.replace(/https?:\/\//, '').split('/')[0];
                            return domain.charAt(0).toUpperCase() + domain.slice(1);
                          }
                        }
                        return s.source === 'pdf' ? 'PDF Document' : 'Document';
                      })()}
                    </div>
                    <div className="muted" style={{fontSize: '12px', marginTop: '4px'}}>
                      {s.text ? s.text.substring(0, 120) + '...' : ''}
                    </div>
                    <div className="small" style={{marginTop: '4px'}}>
                      <a href={s.url} target="_blank" className="srcurl" style={{fontSize: '11px'}}>
                        {s.url ? s.url.replace('https://', '').replace('http://', '') : 'Document'}
                      </a>
                      <span style={{marginLeft: '8px', color: '#93a4bf'}}>
                        Score: {(s.score || 0).toFixed(3)}
                      </span>
                    </div>
                  </div>
                ))
              }
            </div>
            
            <div style={{borderTop:'1px solid var(--line)', padding: '16px'}}>
              <h3 style={{margin: '0 0 16px 0', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '.08em', color: '#9fb3d9'}}>Security Checks</h3>
              <div className="source">
                <span className="tag">PII Redaction</span>
                <div className="muted">emails / phone / IDs masked in prompt</div>
              </div>
              <div className="source">
                <span className="tag">Guardrails</span>
                <div className="muted">refuse unsafe steps • require citations</div>
              </div>
            </div>

            <div style={{borderTop:'1px solid var(--line)', padding: '16px'}}>
              <h3 style={{margin: '0 0 16px 0', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '.08em', color: '#9fb3d9'}}>Integrity Results</h3>
              <div className="hint">Switch to "Integrity Check" mode in the header to analyze text for similarity/plagiarism</div>
              <div dangerouslySetInnerHTML={{ __html: integritySummary }} style={{marginTop:'10px'}} />
              <div dangerouslySetInnerHTML={{ __html: integrityTable }} style={{marginTop:'10px'}} />
            </div>
          </div>
        </aside>
      </div>
    </div>
    </>
  );
}