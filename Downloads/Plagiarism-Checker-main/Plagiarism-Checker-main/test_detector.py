import unittest
import detector

class TestPlagiarismDetector(unittest.TestCase):
    
    def test_tokenize_with_positions(self):
        text = "Hello world, this is a test."
        tokens = detector.tokenize_with_positions(text)
        
        self.assertEqual(len(tokens), 6)
        self.assertEqual(tokens[0]['word'], 'hello')
        self.assertEqual(tokens[0]['start'], 0)
        self.assertEqual(tokens[0]['end'], 5)
        
        self.assertEqual(tokens[5]['word'], 'test')
        self.assertEqual(tokens[5]['start'], 23)
        self.assertEqual(tokens[5]['end'], 27)

    def test_get_ngrams(self):
        text = "one two three four five six"
        tokens = detector.tokenize_with_positions(text)
        ngrams = detector.get_ngrams(tokens, n=4)
        
        self.assertEqual(len(ngrams), 3)
        self.assertEqual(ngrams[0]['text'], "one two three four")
        self.assertEqual(ngrams[1]['text'], "two three four five")
        self.assertEqual(ngrams[2]['text'], "three four five six")

    def test_find_matching_blocks_exact(self):
        text_a = "The quick brown fox jumps over the lazy dog."
        text_b = "A quick brown fox jumps over the lazy cat."
        
        # 'quick brown fox jumps over the lazy' matches (7 words)
        matches = detector.find_matching_blocks(text_a, text_b, n=4)
        
        self.assertTrue(len(matches) >= 1)
        # Verify indices align correctly
        first_match = matches[0]
        self.assertEqual(first_match['text'], "quick brown fox jumps over the lazy")
        
        src_segment = text_a[first_match['source_start']:first_match['source_end']]
        tgt_segment = text_b[first_match['target_start']:first_match['target_end']]
        
        self.assertEqual(src_segment, "quick brown fox jumps over the lazy")
        self.assertEqual(tgt_segment, "quick brown fox jumps over the lazy")

    def test_find_matching_blocks_none(self):
        text_a = "Apple banana orange grape strawberry melon"
        text_b = "Computer monitor keyboard mouse trackpad headphones"
        
        matches = detector.find_matching_blocks(text_a, text_b, n=3)
        self.assertEqual(len(matches), 0)

    def test_calculate_plagiarism_percentage(self):
        # Doc A has 10 words
        text_a = "Yes the quick brown fox jumps over the lazy dog."
        # Doc B does not have "the" at the start of the matching run, so "Yes" and "the" in A do not match
        text_b = "Indeed quick brown fox jumps over the lazy dog was here."
        
        # 8 of 10 words in A match (quick brown fox jumps over the lazy dog)
        # n=5
        pct = detector.calculate_plagiarism_percentage(text_a, text_b, n=5)
        self.assertAlmostEqual(pct, 80.0, places=1)

    def test_compute_cosine_similarity(self):
        text_a = "python programming language"
        text_b = "python programming language tutorial"
        
        similarity = detector.compute_cosine_similarity(text_a, text_b)
        self.assertTrue(similarity > 70.0)
        self.assertTrue(similarity < 100.0)

    def test_code_plagiarism_detection(self):
        code_a = """
        def compute_sum(first_num, second_num):
            # Calculate sum of two values
            total_sum = first_num + second_num
            return total_sum
        """
        code_b = """
        def compute_sum(val_x, val_y):
            # This sum is computed differently
            total_sum = val_x + val_y
            return total_sum
        """
        
        # With variable renaming, normalized token streams should match exactly.
        result = detector.compute_code_similarity(code_a, code_b, "python", n=4)
        
        # Cosine similarity and plagiarism percentages should be high (close to 100)
        self.assertTrue(result['cosine_similarity'] > 95.0)
        self.assertTrue(result['plagiarism_percentage_a'] > 95.0)
        self.assertTrue(result['plagiarism_percentage_b'] > 95.0)
        
        # Verify matching blocks are successfully mapped
        self.assertTrue(len(result['matches']) >= 1)
        first_match = result['matches'][0]
        self.assertEqual(first_match['source_line_start'], 2) # def compute_sum...
        self.assertEqual(first_match['target_line_start'], 2) # def compute_sum...

if __name__ == "__main__":
    unittest.main()
