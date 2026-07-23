import re
import os
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from pypdf import PdfReader
import docx

def extract_text(file_path: str) -> str:
    """Extracts text from a file based on its extension."""
    _, ext = os.path.splitext(file_path.lower())
    
    if ext == '.pdf':
        try:
            reader = PdfReader(file_path)
            text = ""
            for page in reader.pages:
                extracted = page.extract_text()
                if extracted:
                    text += extracted + "\n"
            return text
        except Exception as e:
            raise ValueError(f"Failed to read PDF file: {str(e)}")
            
    elif ext == '.docx':
        try:
            doc = docx.Document(file_path)
            text = ""
            for para in doc.paragraphs:
                text += para.text + "\n"
            return text
        except Exception as e:
            raise ValueError(f"Failed to read DOCX file: {str(e)}")
            
    else:
        # Fallback for plain text, python files, etc.
        encodings = ['utf-8', 'utf-8-sig', 'latin-1', 'cp1252', 'utf-16']
        for enc in encodings:
            try:
                with open(file_path, 'r', encoding=enc) as f:
                    return f.read()
            except UnicodeDecodeError:
                continue
        # Hard fallback with error ignoring
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                return f.read()
        except Exception as e:
            raise ValueError(f"Failed to read text file: {str(e)}")

def tokenize_with_positions(text: str):
    """
    Tokenizes text into words and returns their start and end character indices.
    Normalizes words to lowercase.
    """
    pattern = re.compile(r'\w+')
    tokens = []
    for match in pattern.finditer(text):
        word = match.group(0).lower()
        tokens.append({
            'word': word,
            'text': match.group(0),
            'norm_text': word,
            'start': match.start(),
            'end': match.end()
        })
    return tokens

def get_ngrams(tokens, n=5):
    """
    Creates n-grams of tokens and records their boundary positions in the original text.
    """
    ngrams = []
    for i in range(len(tokens) - n + 1):
        ngram_tokens = tokens[i:i+n]
        ngram_text = " ".join([t['norm_text'] for t in ngram_tokens])
        ngrams.append({
            'text': ngram_text,
            'start': ngram_tokens[0]['start'],
            'end': ngram_tokens[-1]['end'],
            'index': i
        })
    return ngrams

def find_token_matching_blocks(tokens_a, tokens_b, n):
    """
    Unified matching algorithm that performs n-gram matching on token streams.
    Uses DP-based active run tracking to merge contiguous runs in O(Matches) time.
    """
    if len(tokens_a) < n or len(tokens_b) < n:
        return []
        
    ngrams_a = get_ngrams(tokens_a, n)
    ngrams_b = get_ngrams(tokens_b, n)
    
    # Map ngram text to indices for quick lookup
    b_map = {}
    for i, ng in enumerate(ngrams_b):
        b_map.setdefault(ng['text'], []).append(i)
        
    # Find matches
    matches = []
    for i, ng_a in enumerate(ngrams_a):
        matched_indices = b_map.get(ng_a['text'], [])
        for j in matched_indices:
            matches.append((i, j))
            
    if not matches:
        return []
        
    matches.sort()
    
    # Merge consecutive runs
    runs = {}
    for a_idx, b_idx in matches:
        prev_key = (a_idx - 1, b_idx - 1)
        if prev_key in runs:
            run = runs.pop(prev_key)
            run.append((a_idx, b_idx))
            runs[(a_idx, b_idx)] = run
        else:
            runs[(a_idx, b_idx)] = [(a_idx, b_idx)]
            
    merged_runs = list(runs.values())
    
    result = []
    for run in merged_runs:
        start_a_idx = run[0][0]
        end_a_idx = run[-1][0] + n - 1
        
        start_b_idx = run[0][1]
        end_b_idx = run[-1][1] + n - 1
        
        src_start = tokens_a[start_a_idx]['start']
        src_end = tokens_a[end_a_idx]['end']
        
        tgt_start = tokens_b[start_b_idx]['start']
        tgt_end = tokens_b[end_b_idx]['end']
        
        result.append({
            'source_start': src_start,
            'source_end': src_end,
            'target_start': tgt_start,
            'target_end': tgt_end,
            'start_a_idx': start_a_idx,
            'end_a_idx': end_a_idx
        })
        
    # Remove overlapping or redundant sub-matches
    result.sort(key=lambda x: (x['source_end'] - x['source_start']), reverse=True)
    
    cleaned_result = []
    for match in result:
        is_submatch = False
        for existing in cleaned_result:
            source_contained = (match['source_start'] >= existing['source_start'] and 
                                match['source_end'] <= existing['source_end'])
            target_contained = (match['target_start'] >= existing['target_start'] and 
                                match['target_end'] <= existing['target_end'])
            if source_contained or target_contained:
                is_submatch = True
                break
        if not is_submatch:
            cleaned_result.append(match)
            
    cleaned_result.sort(key=lambda x: x['source_start'])
    return cleaned_result

def calculate_plagiarism_percentage_from_tokens(tokens_a, matching_blocks) -> float:
    """
    Computes percentage of tokens_a covered by at least one matching block.
    Runs in O(N + M) using a sorted two-pointer range containment sweep.
    """
    if not tokens_a:
        return 0.0
    if not matching_blocks:
        return 0.0
        
    plagiarized_token_count = 0
    block_idx = 0
    num_blocks = len(matching_blocks)
    
    for token in tokens_a:
        t_start = token['start']
        t_end = token['end']
        
        # Advance block_idx to skip blocks ending before this token starts
        while block_idx < num_blocks and matching_blocks[block_idx]['source_end'] < t_start:
            block_idx += 1
            
        curr_idx = block_idx
        while curr_idx < num_blocks:
            block = matching_blocks[curr_idx]
            if block['source_start'] > t_start:
                break
            if t_end <= block['source_end']:
                plagiarized_token_count += 1
                break
            curr_idx += 1
            
    return (plagiarized_token_count / len(tokens_a)) * 100.0

def find_matching_blocks(text_a: str, text_b: str, n=5):
    """
    Finds contiguous matching word sequences between text_a and text_b.
    """
    tokens_a = tokenize_with_positions(text_a)
    tokens_b = tokenize_with_positions(text_b)
    
    raw_matches = find_token_matching_blocks(tokens_a, tokens_b, n)
    
    result = []
    for m in raw_matches:
        result.append({
            'source_start': m['source_start'],
            'source_end': m['source_end'],
            'target_start': m['target_start'],
            'target_end': m['target_end'],
            'text': text_a[m['source_start']:m['source_end']]
        })
    return result

def calculate_plagiarism_percentage(text_a: str, text_b: str, n=5) -> float:
    """
    Calculates percentage of words in text_a that are part of a matching block with text_b.
    """
    tokens_a = tokenize_with_positions(text_a)
    tokens_b = tokenize_with_positions(text_b)
    matching_blocks = find_token_matching_blocks(tokens_a, tokens_b, n)
    return calculate_plagiarism_percentage_from_tokens(tokens_a, matching_blocks)

def compute_cosine_similarity(text_a: str, text_b: str) -> float:
    """Computes TF-IDF Cosine Similarity between two texts."""
    if not text_a.strip() or not text_b.strip():
        return 0.0
    try:
        vectorizer = TfidfVectorizer()
        tfidf = vectorizer.fit_transform([text_a, text_b])
        similarity = cosine_similarity(tfidf[0:1], tfidf[1:2])[0][0]
        return float(similarity) * 100.0
    except Exception:
        return 0.0

# ===========================================================================
# CODE PLAGIARISM DETECTION — Language-Aware Normalization & Matching
# ===========================================================================

# Combined regex pattern for code comments, string/numeric literals, identifiers, operators, and punctuation.
token_pattern = re.compile(
    r'(?P<BLOCK_COMMENT>/\*.*?\*/)'
    r'|(?P<LINE_COMMENT_C>//[^\n]*)'
    r'|(?P<LINE_COMMENT_PY>#[^\n]*)'
    r'|(?P<DOCSTRING_3D>"""[^\\]*?(?:\\.[^\\]*?)*?""")'
    r'|(?P<DOCSTRING_3S>\'\'\'[^\\]*?(?:\\.[^\\]*?)*?\'\'\')'
    r'|(?P<STR_LIT_D>"(?:[^"\\]|\\.)*")'
    r'|(?P<STR_LIT_S>\'(?:[^\'\\]|\\.)*\')'
    r'|(?P<NUM_HEX>0[xX][0-9a-fA-F]+\b)'
    r'|(?P<NUM_LIT>\b\d+\.?\d*(?:[eE][+-]?\d+)?\b)'
    r'|(?P<IDENT>[A-Za-z_]\w*)'
    r'|(?P<OP>[+\-*/%&|^~<>=!]+)'
    r'|(?P<PUNCT>[(){}\[\];,.:])',
    re.DOTALL
)

def tokenize_code(code: str, language: str):
    """
    Extracts tokens for Python, C, Java code.
    Normalizes identifiers, literals, and ignores comments and docstrings.
    """
    lang = language.lower()
    keywords = {
        'python': {
            'False','None','True','and','as','assert','async','await','break','class',
            'continue','def','del','elif','else','except','finally','for','from',
            'global','if','import','in','is','lambda','nonlocal','not','or','pass',
            'raise','return','try','while','with','yield',
            'print','input','range','len','str','int','float','list','dict','set',
            'tuple','open','self','cls','super','type','isinstance','hasattr'
        },
        'c': {
            'auto','break','case','char','const','continue','default','do','double',
            'else','enum','extern','float','for','goto','if','inline','int','long',
            'register','restrict','return','short','signed','sizeof','static','struct',
            'switch','typedef','union','unsigned','void','volatile','while',
            'include','define','ifdef','ifndef','endif','printf','scanf','malloc','free',
            'NULL','true','false'
        },
        'java': {
            'abstract','assert','boolean','break','byte','case','catch','char','class',
            'const','continue','default','do','double','else','enum','extends','final',
            'finally','float','for','goto','if','implements','import','instanceof','int',
            'interface','long','native','new','package','private','protected','public',
            'return','short','static','strictfp','super','switch','synchronized','this',
            'throw','throws','transient','try','void','volatile','while',
            'String','System','out','println','print','Integer','Double','Boolean',
            'ArrayList','List','Map','HashMap','true','false','null'
        }
    }.get(lang, set())

    tokens = []
    identifier_map = {}
    var_counter = 0

    for match in token_pattern.finditer(code):
        group_dict = match.groupdict()
        val = match.group(0)
        start = match.start()
        end = match.end()

        # Skip comments and Python docstrings
        if (group_dict['BLOCK_COMMENT'] or 
            group_dict['LINE_COMMENT_C'] or 
            group_dict['LINE_COMMENT_PY'] or 
            group_dict['DOCSTRING_3D'] or 
            group_dict['DOCSTRING_3S']):
            continue

        norm_text = val
        if group_dict['STR_LIT_D'] or group_dict['STR_LIT_S']:
            norm_text = 'STR_LIT'
        elif group_dict['NUM_HEX'] or group_dict['NUM_LIT']:
            norm_text = 'NUM_LIT'
        elif group_dict['IDENT']:
            if val in keywords:
                norm_text = val
            else:
                if val not in identifier_map:
                    var_counter += 1
                    identifier_map[val] = f'VAR_{var_counter}'
                norm_text = identifier_map[val]

        tokens.append({
            'word': norm_text,
            'text': val,
            'norm_text': norm_text,
            'start': start,
            'end': end
        })

    return tokens

def normalize_code(code: str, language: str) -> str:
    """
    Normalizes source code for plagiarism comparison:
    1. Strips language-specific comments
    2. Normalizes string and numeric literals
    3. Abstracts identifiers to generic VAR_N tokens
    Returns the normalized token stream as a space-joined string.
    """
    tokens = tokenize_code(code, language)
    return ' '.join([t['norm_text'] for t in tokens])

def _get_code_line_map(code: str):
    """
    Returns a list of (line_number, start_char, end_char) for each line
    in `code` so we can map character offsets back to line numbers.
    """
    lines = []
    pos = 0
    for i, line in enumerate(code.splitlines(keepends=True)):
        lines.append((i + 1, pos, pos + len(line)))
        pos += len(line)
    return lines

def _char_to_line(char_pos: int, line_map) -> int:
    """Return 1-based line number for a character position."""
    for line_num, start, end in line_map:
        if start <= char_pos < end:
            return line_num
    return len(line_map)

def find_code_matching_blocks(code_a: str, code_b: str, language: str, n: int = 4):
    """
    Finds matching blocks between two code snippets using normalized token streams.
    """
    tokens_a = tokenize_code(code_a, language)
    tokens_b = tokenize_code(code_b, language)
    
    raw_matches = find_token_matching_blocks(tokens_a, tokens_b, n)
    
    line_map_a = _get_code_line_map(code_a)
    line_map_b = _get_code_line_map(code_b)
    
    result = []
    for m in raw_matches:
        start_a_idx = m['start_a_idx']
        end_a_idx = m['end_a_idx']
        
        src_line_start = _char_to_line(m['source_start'], line_map_a)
        src_line_end   = _char_to_line(max(m['source_end'] - 1, m['source_start']), line_map_a)
        tgt_line_start = _char_to_line(m['target_start'], line_map_b)
        tgt_line_end   = _char_to_line(max(m['target_end'] - 1, m['target_start']), line_map_b)
        
        norm_text = " ".join([t['norm_text'] for t in tokens_a[start_a_idx:end_a_idx + 1]])
        
        result.append({
            'source_start': m['source_start'],
            'source_end': m['source_end'],
            'target_start': m['target_start'],
            'target_end': m['target_end'],
            'source_line_start': src_line_start,
            'source_line_end': src_line_end,
            'target_line_start': tgt_line_start,
            'target_line_end': tgt_line_end,
            'text': code_a[m['source_start']:m['source_end']],
            'norm_text': norm_text
        })
    return result

def compute_code_similarity(code_a: str, code_b: str, language: str, n: int = 4) -> dict:
    """
    Computes full code similarity report between two code snippets.
    Returns cosine similarity, plagiarism percentages, and matching blocks.
    """
    tokens_a = tokenize_code(code_a, language)
    tokens_b = tokenize_code(code_b, language)
    
    norm_a = ' '.join([t['norm_text'] for t in tokens_a])
    norm_b = ' '.join([t['norm_text'] for t in tokens_b])
    
    cosine = compute_cosine_similarity(norm_a, norm_b)
    
    matching_blocks_a = find_token_matching_blocks(tokens_a, tokens_b, n)
    matching_blocks_b = find_token_matching_blocks(tokens_b, tokens_a, n)
    
    plag_a = calculate_plagiarism_percentage_from_tokens(tokens_a, matching_blocks_a)
    plag_b = calculate_plagiarism_percentage_from_tokens(tokens_b, matching_blocks_b)
    
    # find_code_matching_blocks builds character offsets and line maps
    matches = find_code_matching_blocks(code_a, code_b, language, n)
    
    return {
        'cosine_similarity': round(cosine, 2),
        'plagiarism_percentage_a': round(plag_a, 2),
        'plagiarism_percentage_b': round(plag_b, 2),
        'matches': matches,
        'normalized_a': norm_a,
        'normalized_b': norm_b,
    }
