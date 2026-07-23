import os
from typing import Dict, List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

import detector

app = FastAPI(title="Premium Plagiarism Detector API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory database of uploaded files for session-based detailed comparisons
uploaded_files_cache: Dict[str, str] = {}

class TextCompareRequest(BaseModel):
    title_a: str
    text_a: str
    title_b: str
    text_b: str
    n_gram_size: Optional[int] = 5

class CodeCompareRequest(BaseModel):
    title_a: str
    code_a: str
    title_b: str
    code_b: str
    language: str = "python"   # "python" | "java" | "c"
    n_gram_size: Optional[int] = 4

@app.get("/")
async def serve_index():
    if os.path.exists("index.html"):
        return FileResponse("index.html")
    raise HTTPException(status_code=404, detail="index.html not found")

@app.get("/style.css")
async def serve_css():
    if os.path.exists("style.css"):
        return FileResponse("style.css", media_type="text/css")
    raise HTTPException(status_code=404, detail="style.css not found")

@app.get("/app.js")
async def serve_js():
    if os.path.exists("app.js"):
        return FileResponse("app.js", media_type="application/javascript")
    raise HTTPException(status_code=404, detail="app.js not found")

@app.post("/api/compare-raw-text")
async def compare_raw_text(req: TextCompareRequest):
    try:
        cosine = detector.compute_cosine_similarity(req.text_a, req.text_b)
        plag_a = detector.calculate_plagiarism_percentage(req.text_a, req.text_b, req.n_gram_size)
        plag_b = detector.calculate_plagiarism_percentage(req.text_b, req.text_a, req.n_gram_size)
        matches = detector.find_matching_blocks(req.text_a, req.text_b, req.n_gram_size)
        
        return {
            "cosine_similarity": round(cosine, 2),
            "plagiarism_percentage_a": round(plag_a, 2),
            "plagiarism_percentage_b": round(plag_b, 2),
            "matches": matches
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/compare-code")
async def compare_code(req: CodeCompareRequest):
    """
    Code-aware plagiarism detection for Python, Java, and C.
    Normalizes code (strips comments, abstracts identifiers) before comparing.
    """
    allowed_languages = {"python", "java", "c"}
    lang = req.language.lower()
    if lang not in allowed_languages:
        raise HTTPException(status_code=400, detail=f"Unsupported language '{req.language}'. Choose from: python, java, c.")

    if not req.code_a.strip() or not req.code_b.strip():
        raise HTTPException(status_code=400, detail="Both code snippets must be non-empty.")

    try:
        result = detector.compute_code_similarity(req.code_a, req.code_b, lang, req.n_gram_size)
        return {
            "title_a": req.title_a,
            "title_b": req.title_b,
            "language": lang,
            "cosine_similarity": result["cosine_similarity"],
            "plagiarism_percentage_a": result["plagiarism_percentage_a"],
            "plagiarism_percentage_b": result["plagiarism_percentage_b"],
            "matches": result["matches"],
            "normalized_a": result["normalized_a"],
            "normalized_b": result["normalized_b"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/compare-files")
async def compare_files(
    files: List[UploadFile] = File(...),
    n_gram_size: int = Form(5)
):
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="Please upload at least 2 files to compare.")
        
    global uploaded_files_cache
    uploaded_files_cache.clear()  # Clear previous cache
    
    file_contents = {}
    file_info = []
    
    # Extract text from files and cache them
    for f in files:
        safe_filename = os.path.basename(f.filename)
        import uuid
        _, ext = os.path.splitext(safe_filename)
        temp_filename = f"temp_{uuid.uuid4().hex}{ext}"
        try:
            # We must write to a temp file to read via parser (pypdf, docx need a file path or file-like object)
            # Writing to temporary file in local Cwd (as per workspace rules)
            with open(temp_filename, "wb") as temp_file:
                temp_file.write(await f.read())
                
            text = detector.extract_text(temp_filename)
            if os.path.exists(temp_filename):
                os.remove(temp_filename)  # clean up immediately
            
            file_contents[safe_filename] = text
            uploaded_files_cache[safe_filename] = text
            
            # Simple metadata
            words = len(text.split())
            file_info.append({
                "id": safe_filename,
                "name": safe_filename,
                "word_count": words,
                "char_count": len(text)
            })
        except Exception as e:
            # Cleanup temp file if exists
            if os.path.exists(temp_filename):
                os.remove(temp_filename)
            raise HTTPException(status_code=400, detail=f"Error parsing file {safe_filename}: {str(e)}")
            
    # Pairwise comparison matrix
    matrix = {}
    highest_matches = []
    
    filenames = list(file_contents.keys())
    for i, name_a in enumerate(filenames):
        matrix[name_a] = {}
        max_similarity = -1.0
        match_file = None
        
        for j, name_b in enumerate(filenames):
            if name_a == name_b:
                matrix[name_a][name_b] = {"cosine": 100.0, "plagiarism": 100.0}
                continue
                
            text_a = file_contents[name_a]
            text_b = file_contents[name_b]
            
            cosine = detector.compute_cosine_similarity(text_a, text_b)
            plag = detector.calculate_plagiarism_percentage(text_a, text_b, n_gram_size)
            
            matrix[name_a][name_b] = {
                "cosine": round(cosine, 2),
                "plagiarism": round(plag, 2)
            }
            
            # Keep track of the highest match score (we use cosine as primary similarity score here)
            if cosine > max_similarity:
                max_similarity = cosine
                match_file = name_b
                
        highest_matches.append({
            "file": name_a,
            "match_file": match_file,
            "similarity": round(max_similarity, 2)
        })
        
    return {
        "files": file_info,
        "matrix": matrix,
        "highest_matches": highest_matches
    }

@app.get("/api/detailed-comparison")
async def detailed_comparison(file_a: str, file_b: str, n_gram_size: int = 5):
    global uploaded_files_cache
    if file_a not in uploaded_files_cache or file_b not in uploaded_files_cache:
        raise HTTPException(
            status_code=404, 
            detail="File content not found in cache. Please re-upload the files."
        )
        
    text_a = uploaded_files_cache[file_a]
    text_b = uploaded_files_cache[file_b]
    
    try:
        cosine = detector.compute_cosine_similarity(text_a, text_b)
        plag_a = detector.calculate_plagiarism_percentage(text_a, text_b, n_gram_size)
        plag_b = detector.calculate_plagiarism_percentage(text_b, text_a, n_gram_size)
        matches = detector.find_matching_blocks(text_a, text_b, n_gram_size)
        
        return {
            "file_a_name": file_a,
            "file_b_name": file_b,
            "file_a_text": text_a,
            "file_b_text": text_b,
            "cosine_similarity": round(cosine, 2),
            "plagiarism_percentage_a": round(plag_a, 2),
            "plagiarism_percentage_b": round(plag_b, 2),
            "matches": matches
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
