// Yes this thing is created with Gemini. Shame on me.

// For a Firefox employee: Thank You for your work!


document.getElementById('startBtn').addEventListener('click', async () => {
	const statusDiv = document.getElementById('status');
	const resultsTable = document.getElementById('resultsTable');
	
	resultsTable.innerHTML = "";
	resultsTable.style.display = "none";
	statusDiv.textContent = "Extracting session token...";
	
	const today = new Date();
	const yyyymmdd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
	const startDate = `${yyyymmdd}T00:00+00:00`;
	const endDate = `${yyyymmdd}T23:59+00:00`;
	
	// Edit here to change the resulting sheet
	const targetFilters = [
		// --- ARRIVALS TAB ---
		{
			label: "Привоз",                             
			endpoint: "/api2/widget/widgets/arrivals",
			useDates: false,
			queryParams: {},
			extract: (data, todayStr) => {
				if (!Array.isArray(data)) return "N/A";
				const todayData = data.find(item => item.date && item.date.startsWith(todayStr));
				return todayData && todayData.arrivedPostingCount !== undefined ? todayData.arrivedPostingCount : 0;
			}
		},
		// --- LOG TAB ---
		{ 
			label: "Выдано", 
			endpoint: "/api2/reports/give_out/logV2", 
			useDates: true,
			operationTypes: ["GiveoutAll", "GiveoutPart"],
			queryParams: { take: "50", skip: "0" }
		},
		{ 
			label: "Выдано<br>полностью", 
			endpoint: "/api2/reports/give_out/logV2", 
			useDates: true,
			queryParams: { take: "50", skip: "0" }
		},
		{ 
			label: "Остаток", 
			endpoint: "/api2/reports/agent/warehouse_remainsV2", 
			useDates: false,
			queryParams: { filter: "All", stateFilter: "Giveout", postingNumber: "", take: "50", skip: "0" }
		},
		{ 
			label: "Остаток<br>полностью", 
			endpoint: "/api2/reports/agent/warehouse_remainsV2", 
			useDates: false,
			queryParams: { filter: "All", postingNumber: "", take: "50", skip: "0" }
		},
		{ 
			label: "Возврат", 
			endpoint: "/api2/reports/agent/warehouse_remainsV2", 
			useDates: false,
			queryParams: { filter: "All", stateFilter: "Return", postingNumber: "", take: "50", skip: "0" }
		},
		{
			label: "Аннулирование",
			endpoint: "/api2/reports/give_out/logV2", 
			useDates: true,
			operationTypes: ["Annul", "AnnuAfterOpen"],
			queryParams: { take: "50", skip: "0" }
		},
	];
	
	const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
	if (!tab.url || !tab.url.includes("turbo-pvz.ozon.ru")) {
		statusDiv.textContent = "Error: Click inside your Ozon tab first!";
		return;
	}
	
	const scriptResult = await browser.scripting.executeScript({
		target: { tabId: tab.id },
		func: () => {
			const rawData = localStorage.getItem('pvz-access-token');
			if (!rawData) return null;
			try { return JSON.parse(rawData).access_token; } catch (e) { return null; }
		}
	});
	
	const token = scriptResult[0]?.result;
	if (!token) {
		statusDiv.textContent = "Error: Token missing. Refresh Ozon!";
		return;
	}
	
	// Array to temporarily collect all harvested metrics
	const collectedResults = [];
	
	for (const item of targetFilters) {
		statusDiv.textContent = `Fetching ${item.label}...`;
		
		try {
			const baseUrl = `https://turbo-pvz.ozon.ru${item.endpoint}`;
			const urlParams = new URLSearchParams(item.queryParams);
			
			if (item.useDates) {
				urlParams.append("startDate", startDate);
				urlParams.append("endDate", endDate);
			}
			
			let targetUrl = `${baseUrl}?${urlParams.toString()}`;
			
			if (item.operationTypes) {
				item.operationTypes.forEach(type => {
					targetUrl += `&operationTypes=${type}`;
				});
			}
			
			const response = await fetch(targetUrl, {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${token}`,
					'Accept': 'application/json, text/plain, */*',
					'X-O3-App-Name': 'turbo-pvz-ui',
					'X-O3-App-Version': 'release/55910745',
					'X-O3-Version-Name': '3.10.46',
					'X-O3-FP': 'cc4f87eb68914d98849b3fc245d87284'
				}
			});
			
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			
			const data = await response.json();
			
			let countValue = "N/A";
			
			if (item.extract) {
				countValue = item.extract(data, yyyymmdd);
			} else {
				if (data.totalCount !== undefined) {
					countValue = data.totalCount;
				} else if (data.count !== undefined) {
					countValue = data.count;
				} else {
					for (const wrapperKey in data) {
						if (data[wrapperKey] && typeof data[wrapperKey] === 'object') {
							if (data[wrapperKey].totalCount !== undefined) {
								countValue = data[wrapperKey].totalCount;
								break;
							} else if (data[wrapperKey].count !== undefined) {
								countValue = data[wrapperKey].count;
								break;
							}
						}
					}
				}
			}
			
			// Save data for final horizontal rendering
			collectedResults.push({ label: item.label, value: countValue });
			
		} catch (err) {
			console.error(`Error processing ${item.label}:`, err);
			collectedResults.push({ label: item.label, value: "Error" });
		}
	}
	
	// 5. RENDERING ENGINE: Build horizontal matrix
	const headerRow = document.createElement('tr');
	const valueRow = document.createElement('tr');
	
	// --- DATE COLUMN ---
	const dateTh = document.createElement('th');
	dateTh.textContent = "Дата";
	headerRow.appendChild(dateTh);
	
	const dateTd = document.createElement('td');
	dateTd.style.color = "#555"; // Subtle gray color for the date text
	dateTd.style.fontSize = "11px";
	dateTd.textContent = today.toLocaleDateString('ru-RU'); // Outputs: DD.MM.YYYY
	valueRow.appendChild(dateTd);
	// ------------------------------------
	
	// Append the rest of your harvested metrics
	collectedResults.forEach(result => {
		// Append header blocks
		const th = document.createElement('th');
		th.innerHTML = result.label;
		headerRow.appendChild(th);
		
		// Append value blocks
		const td = document.createElement('td');
		td.className = "count";
		td.textContent = result.value;
		if (result.value === "Error") td.style.color = "red";
		valueRow.appendChild(td);
	});
	
	resultsTable.appendChild(headerRow);
	resultsTable.appendChild(valueRow);
	
	statusDiv.textContent = "Done!";
	resultsTable.style.display = "table";
});
