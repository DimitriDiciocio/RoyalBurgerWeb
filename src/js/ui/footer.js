// src/js/ui/footer.js

async function loadFooter() {
  const response = await fetch("src/components/layout/footer.html"); 
  const data = await response.text();
  document.getElementById("footer-container").innerHTML = data;
}

// executa quando a página carregar
document.addEventListener("DOMContentLoaded", loadFooter);
