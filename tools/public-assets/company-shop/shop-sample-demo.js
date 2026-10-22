
    (() => {
      const products = __SHOP_SAMPLE_PRODUCTS__;
      const state = {
        stock: Object.fromEntries(products.map(product => [product.id, product.initialStock])),
        basket: {},
        todayTotal: 0,
        saleCount: 0,
        category: "All",
        search: ""
      };
      const byId = id => document.getElementById(id);
      const formatMMK = amount => `${new Intl.NumberFormat("en-US").format(amount)} MMK`;
      const basketQuantity = () => Object.values(state.basket).reduce((sum, quantity) => sum + quantity, 0);
      const basketTotal = () => products.reduce((sum, product) => sum + product.price * (state.basket[product.id] || 0), 0);
      function renderProducts() {
        const query = state.search.trim().toLocaleLowerCase();
        const visible = products.filter(product => {
          const matchesCategory = state.category === "All" || product.category === state.category;
          const matchesSearch = !query || `${product.name} ${product.category} ${product.myanmar || ""}`.toLocaleLowerCase().includes(query);
          return matchesCategory && matchesSearch;
        });
        const grid = byId("productGrid");
        if (visible.length === 0) {
          grid.innerHTML = '<div class="empty-results"><strong>No matching products</strong><span>Try another search or category.</span></div>';
          return;
        }
        grid.innerHTML = visible.map(product => {
          const stock = state.stock[product.id];
          const inBasket = state.basket[product.id] || 0;
          const limitReached = inBasket >= stock;
          const stockLabel = stock === 0 ? "Out of sample stock" : limitReached ? `${inBasket} in basket · sample stock limit` : `${stock} in sample stock`;
          const disabled = stock === 0 || limitReached ? "disabled" : "";
          return `<button class="product-card" type="button" data-add="${product.id}" aria-label="Add ${product.name}, ${formatMMK(product.price)}, ${stockLabel}" ${disabled}>
            <span class="product-icon"><img src="${product.photo}" width="192" height="192" alt="" /></span>
            <span class="product-copy"><span class="product-name">${product.name}</span>
            <span class="product-meta"><span class="product-price">${formatMMK(product.price)}</span><span class="product-stock">${stockLabel}</span></span></span>
          </button>`;
        }).join("");
      }

      function renderBasket() {
        const count = basketQuantity();
        const total = basketTotal();
        const rows = byId("basketRows");
        byId("basketCount").textContent = String(count);
        byId("basketCount").setAttribute("aria-label", `${count} ${count === 1 ? "item" : "items"}`);
        byId("basketTotal").textContent = formatMMK(total);
        byId("dockCount").textContent = String(count);
        byId("dockTotal").textContent = formatMMK(total);
        byId("completeSale").disabled = count === 0;
        if (count === 0) {
          rows.innerHTML = '<li class="basket-empty">Your basket is ready<br>for the first item.</li>';
          return;
        }
        rows.innerHTML = products.filter(product => state.basket[product.id]).map(product => {
          const quantity = state.basket[product.id];
          const atStockLimit = quantity >= state.stock[product.id];
          return `<li class="basket-item">
            <div><div class="basket-item-name">${product.name}</div><div class="basket-item-price">${formatMMK(product.price * quantity)}</div></div>
            <div class="quantity-controls" aria-label="Quantity for ${product.name}">
              <button class="quantity-button" type="button" data-action="decrease" data-id="${product.id}" aria-label="Remove one ${product.name}">−</button>
              <span class="quantity-value" aria-live="polite">${quantity}</span>
              <button class="quantity-button" type="button" data-action="increase" data-id="${product.id}" aria-label="Add one ${product.name}" ${atStockLimit ? "disabled" : ""}>+</button>
            </div>
          </li>`;
        }).join("");
      }

      function renderTotals() {
        byId("todayTotal").textContent = formatMMK(state.todayTotal);
      }

      function renderAll() {
        renderProducts();
        renderBasket();
        renderTotals();
      }

      function focusBasketControl(id, action) {
        const rows = byId("basketRows");
        const requested = rows.querySelector(`button[data-action="${action}"][data-id="${id}"]`);
        if (requested && !requested.disabled) {
          requested.focus();
          return;
        }
        const removeThisItem = rows.querySelector(`button[data-action="decrease"][data-id="${id}"]`);
        if (removeThisItem) {
          removeThisItem.focus();
          return;
        }
        const nextItem = rows.querySelector('button[data-action="decrease"]');
        if (nextItem) {
          nextItem.focus();
          return;
        }
        byId("productSearch").focus();
      }

      function focusProductOrBasket(id) {
        const button = byId("productGrid").querySelector(`button[data-add="${id}"]`);
        if (button && !button.disabled) {
          button.focus();
          return;
        }
        focusBasketControl(id, "decrease");
      }

      function highlightSampleSale() {
        [byId("todayTotal"), byId("receipt")].forEach(element => {
          element.classList.remove("sample-state-highlight");
          void element.offsetWidth;
          element.classList.add("sample-state-highlight");
        });
      }

      function showReceipt(items, total) {
        const receipt = byId("receipt");
        const saleNumber = String(state.saleCount).padStart(3, "0");
        byId("receiptId").textContent = `SAMPLE-${saleNumber}`;
        byId("receiptLines").innerHTML = items.map(item => `<li class="receipt-line"><span>${item.quantity} × ${item.name}</span><span>${formatMMK(item.price * item.quantity)}</span></li>`).join("");
        byId("receiptTotal").textContent = `Total · ${formatMMK(total)}`;
        receipt.hidden = false;
      }

      byId("productGrid").addEventListener("click", event => {
        const button = event.target.closest("button[data-add]");
        if (!button) return;
        const product = products.find(item => item.id === button.dataset.add);
        if (!product) return;
        if (state.stock[product.id] <= (state.basket[product.id] || 0)) {
          byId("saleStatus").textContent = `Sample stock limit reached for ${product.name}. Remove a basket quantity to make room.`;
          return;
        }
        state.basket[product.id] = (state.basket[product.id] || 0) + 1;
        const limitReached = state.basket[product.id] >= state.stock[product.id];
        byId("saleStatus").textContent = limitReached
          ? `Sample stock limit reached for ${product.name}. ${state.basket[product.id]} items are in the basket; remove a quantity to change it.`
          : `${product.name} added to the sample basket.`;
        byId("receipt").hidden = true;
        renderProducts();
        renderBasket();
        if (limitReached) focusBasketControl(product.id, "decrease");
        else focusProductOrBasket(product.id);
      });

      byId("basketRows").addEventListener("click", event => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        const { action, id } = button.dataset;
        if (!state.basket[id]) return;
        if (action === "increase" && state.basket[id] < state.stock[id]) state.basket[id] += 1;
        if (action === "decrease") {
          state.basket[id] -= 1;
          if (state.basket[id] <= 0) delete state.basket[id];
        }
        const limitReached = state.basket[id] >= state.stock[id];
        byId("saleStatus").textContent = limitReached
          ? `Sample stock limit reached for ${products.find(product => product.id === id).name}. Remove a quantity to change it.`
          : "Basket quantities updated.";
        renderProducts();
        renderBasket();
        focusBasketControl(id, action);
      });

      byId("productSearch").addEventListener("input", event => {
        state.search = event.target.value;
        renderProducts();
      });

      document.querySelectorAll(".category-button").forEach(button => {
        button.addEventListener("click", () => {
          state.category = button.dataset.category;
          document.querySelectorAll(".category-button").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
          renderProducts();
        });
      });

      byId("saleForm").addEventListener("submit", event => {
        event.preventDefault();
        const total = basketTotal();
        const quantity = basketQuantity();
        if (quantity === 0) return;
        const items = products.filter(product => state.basket[product.id]).map(product => ({
          id: product.id,
          name: product.name,
          quantity: state.basket[product.id],
          price: product.price
        }));
        items.forEach(item => { state.stock[item.id] -= item.quantity; });
        state.todayTotal += total;
        state.saleCount += 1;
        state.basket = {};
        showReceipt(items, total);
        byId("saleStatus").textContent = `Sample sale ${String(state.saleCount).padStart(3, "0")} complete. Sample stock and today total updated in this page.`;
        renderAll();
        highlightSampleSale();
        byId("receipt").focus();
      });

      byId("resetExample").addEventListener("click", () => {
        state.stock = Object.fromEntries(products.map(product => [product.id, product.initialStock]));
        state.basket = {};
        state.todayTotal = 0;
        state.saleCount = 0;
        byId("productSearch").value = "";
        state.search = "";
        state.category = "All";
        document.querySelectorAll(".category-button").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.category === "All")));
        byId("receipt").hidden = true;
        byId("receipt").classList.remove("sample-state-highlight");
        byId("todayTotal").classList.remove("sample-state-highlight");
        byId("saleStatus").textContent = "Example reset. Sample data has been restored.";
        renderAll();
      });

      renderAll();
    })();
