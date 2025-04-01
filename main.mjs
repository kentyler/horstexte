// main.js - Client-side JavaScript for Hors-Texte test interface

document.addEventListener('DOMContentLoaded', () => {
    // Create Prompt Form
    document.getElementById('promptForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = document.getElementById('promptText').value;
        
        // Generate title from first 50 characters
        const title = text.length > 50 ? text.substring(0, 50) + '...' : text;
        
        try {
            const response = await fetch('/api/prompts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title, text })
            });
            
            const data = await response.json();
            const resultElement = document.getElementById('promptResult');
            resultElement.textContent = JSON.stringify(data, null, 2);
            resultElement.classList.remove('hidden');
            
            // Clear the form after successful submission
            document.getElementById('promptText').value = '';
        } catch (error) {
            console.error('Error:', error);
        }
    });
});