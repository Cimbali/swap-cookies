function get_canonical_domain_name(hostname)
{
	return new Promise((ok, no) =>
	{
		load_suffix_list.then(() => ok(publicSuffixList.getDomain(punycode.toASCII(hostname))));
	});
}

check_update.then(() =>
{
	// Initialliy load all stored cookies and set badges for all URLs they match
	browser.storage.local.get().then(storage =>
	{
		Object.keys(storage).filter(k => k != 'configuration').forEach(storage_id =>
		{
			var [hostname, store_id] = storage_id.split('@');
			var cur_id = storage[storage_id].current;
			var cur_name = storage[storage_id].jars[cur_id].name;

			browser.tabs.query({ url: '*://*.' + hostname + '/*', cookieStoreId: store_id }).then(tabs =>
			{
				tabs.forEach(tab => { browser.browserAction.setBadgeText({tabId: tab.id, text: cur_name}); });
			});
		});
	});

	// When a tab stops loading, check if we have a cookie profile for it and if so set the badge
	browser.tabs.onUpdated.addListener((storage_id, changeInfo, tab) => {
		if ('status' in changeInfo && changeInfo.status === 'complete') {
			get_canonical_domain_name(new URL(tab.url).hostname).then(hostname =>
			{
				var storage_id = hostname + '@' + tab.cookieStoreId;

				browser.storage.local.get(storage_id).then(storage =>
				{
					if (storage_id in storage)
					{
						var cur_id = storage[storage_id].current;
						var cur_name = storage[storage_id].jars[cur_id].name;
						browser.browserAction.setBadgeText({tabId: tab.id, text: cur_name});
					}
				});
			});
		}
	});

	browser.browserAction.setBadgeBackgroundColor({color: [0, 0, 0, 0x60]});
});
