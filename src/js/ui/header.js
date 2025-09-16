// src/js/ui/header.js

async function loadHeader() {
  const response = await fetch("src/components/layout/header.html"); 
  const data = await response.text();
  document.getElementById("header-container").innerHTML = data;
}

// executa quando a página carregar
document.addEventListener("DOMContentLoaded", loadHeader);
