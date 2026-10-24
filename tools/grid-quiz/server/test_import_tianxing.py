import tempfile
import unittest
from pathlib import Path

from import_tianxing import convert_content


class ContentTests(unittest.TestCase):
    def test_preserves_math_tables_and_escapes_external_markup(self):
        with tempfile.TemporaryDirectory() as directory:
            text, markup = convert_content(
                '<p onclick="bad()">2<sup>n</sup> &lt; 10</p>'
                '<script>bad()</script><iframe src="https://example.com">hidden</iframe>'
                '<table><tr><td colspan="2">A &amp; B</td></tr></table>', {}, Path(directory), False)
        self.assertIn('2n < 10', text)
        self.assertIn('<sup>n</sup>', markup)
        self.assertIn('colspan="2"', markup)
        self.assertIn('A &amp; B', markup)
        self.assertNotIn('onclick', markup)
        self.assertNotIn('bad()', markup)
        self.assertNotIn('iframe', markup)
        self.assertNotIn('hidden', text)

    def test_images_are_local_and_only_from_the_expected_source(self):
        with tempfile.TemporaryDirectory() as directory:
            assets = {}
            text, markup = convert_content(
                '<img src="https://alioss.tianxingdianli.com/questions/a.png" onerror="bad()">',
                assets, Path(directory), False)
            self.assertEqual(text, '[插图]')
            self.assertIn('/tools/grid-quiz/media/', markup)
            self.assertNotIn('onerror', markup)
            self.assertEqual(len(assets), 1)
            for source in ('https://example.com/a.png', 'data:image/svg+xml,test',
                           'https://alioss.tianxingdianli.com/a.svg'):
                with self.assertRaises(ValueError):
                    convert_content('<img src="' + source + '">', {}, Path(directory), False)


if __name__ == '__main__':
    unittest.main()
