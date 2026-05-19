document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchInput');
  const cards = document.querySelectorAll('.topic-card');
  const sections = document.querySelectorAll('.category-section');
  const noResults = document.getElementById('no-results');

  searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    let hasResults = false;

    sections.forEach(section => {
      let visibleCardsInSection = 0;
      const sectionCards = section.querySelectorAll('.topic-card');

      sectionCards.forEach(card => {
        const title = card.querySelector('h3').textContent.toLowerCase();
        const desc = card.querySelector('p').textContent.toLowerCase();
        const tags = card.dataset.tags ? card.dataset.tags.toLowerCase() : '';

        const isMatch = title.includes(term) || desc.includes(term) || tags.includes(term);

        if (isMatch) {
          card.classList.remove('hidden');
          visibleCardsInSection++;
          hasResults = true;
        } else {
          card.classList.add('hidden');
        }
      });

      if (visibleCardsInSection === 0) {
        section.classList.add('hidden');
      } else {
        section.classList.remove('hidden');
      }
    });

    if (hasResults) {
      noResults.classList.add('hidden');
    } else {
      noResults.classList.remove('hidden');
    }
  });
});