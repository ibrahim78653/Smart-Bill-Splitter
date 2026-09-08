import os
import google.generativeai as genai
from dotenv import load_dotenv
from PIL import Image

load_dotenv('backend/.env')
genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
img = Image.new('RGB', (50, 50), color='white')

for m_name in ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']:
    try:
        model = genai.GenerativeModel(m_name)
        res = model.generate_content(
            ['Return JSON: {"status": "ok"}', img],
            generation_config=genai.GenerationConfig(
                response_mime_type='application/json',
                temperature=0.0
            )
        )
        print(m_name, 'SUCCESS ->', res.text.strip())
    except Exception as e:
        print(m_name, 'FAILED ->', e)
