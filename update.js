function request(obj)
{
	// Promise wrapping an XHR. url is the only mandatory parameter.
	// Options parameters include headers (dict of header name => header value),
	// mime (mime type string), body (data to send), method (defaults to "GET")
	return new Promise((resolve, reject) =>
	{
		let xhr = new XMLHttpRequest();
		xhr.open('method' in obj ? obj.method : "GET", obj.url);
		let headers = 'headers' in obj ? Object.keys(obj.headers) : [];
		headers.forEach(key => { xhr.setRequestHeader(key, headers[key]); });
		if ('mime' in obj) xhr.overrideMimeType(obj.mime);
		xhr.onload = () =>
		{
			if (xhr.status >= 200 && xhr.status < 300)
				resolve(xhr.response);
			else
				reject(xhr.statusText);
		};
		xhr.onerror = () => reject(xhr.statusText);
		xhr.send('body' in obj ? obj.body : undefined);
	});
};

async function cookiejar_array_to_dict()
{
	var storage = await browser.storage.local.get(null);
	Object.keys(storage).filter(k => k != 'configuration').forEach(shelf =>
	{
		// Previously used an Array for jar, with a .name property added to it,
		// however this got stripped when saved for browser restart (issue #1)
		// Replace each jar that is an array with a {name: 'profile name', cookies: []} object
		storage[shelf] = storage[shelf].jars.map(jar =>
			!Array.isArray(jar) ? jar : { name: jar.name || 'Unnamed profile', cookies: jar.splice(0, jar.length) });
	});

	await browser.storage.local.set(storage);
	return '1.1';
}

async function use_public_domain_list()
{
	var storage = await browser.storage.local.get(null);
	publicSuffixList.parse(data.configuration.psl.list);

	Object.keys(storage).filter(k => k != 'configuration').forEach(shelf =>
	{
		// Previously we used whatever domain name was in the URL to save cookies.
		// Now we use the domain as defiend in publicsuffixlist, which is {label}.{public suffix}
		// Where public suffix is the longest public suffix as defined by https://publicsuffix.org/list/
		// and label is a non-dot-separated.
		var [domain, cookie_store_id] = shelf.split('@');
		var canonical = publicSuffixList.getDomain(punycode.toASCII(domain));
		if (domain != canonical)
		{
			storage[canonical + '@' + cookie_store_id] = storage[shelf];
			delete storage[shelf];
		}
	});

	await browser.storage.local.set(data);
	return '1.3';
}

function fallback_public_suffix_list(config)
{
	// No public suffix list: load the fallback one
	return request({ url: '/psl.json', mime: 'application/json' }).then(arr =>
	{
		config['psl'] = { date: new Date('2018-03-05'), list: arr };
	}).then(() => true).catch(() => false);
}

function refresh_public_suffix_list(config)
{
	return request({ url: 'https://publicsuffix.org/list/public_suffix_list.dat' }).then(data =>
	{
		var arr = data.split('\n')
			.map(l => punycode.toASCII(l.trim()))
			.filter(l => l.length && !l.startsWith('//'));
		config['psl'] = { date: new Date(), list: arr };
	}).then(() => true).catch(() => false);
}

// serves as valid list of version names as well as mapping to which function to call
const updaters = { '1.0': cookiejar_array_to_dict, '1.1': use_public_domain_list, '1.2': use_public_domain_list };

// Do the checking, return a promise that resolves whenever we have finished updating
var check_update = (async function ()
{
	var data = await browser.storage.local.get('configuration');

	var version = browser.runtime.getManifest().version;
	var config = 'configuration' in data ? data.configuration : {};
	if ('version' in config && config.version in updaters)
		var update_from = config.version;
	else
		var update_from = '1.0';

	var updated = (version != update_from);

	// Make sure the public suffix list exists
	if (true || !('psl' in config))
		updated = (await fallback_public_suffix_list(config)) || updated;

	// Refresh every 7 days
	if ((new Date() - new Date(config.psl.date)) > (1000 * 3600 * 24 * 7))
		updated = (await refresh_public_suffix_list(config)) || updated;

	while (update_from != version && update_from in updaters)
		update_from = updaters[update_from];

	if (updated)
	{
		Object.assign(config, { version: version });
		await browser.storage.local.set({ 'configuration': config });
	}
})();

var load_suffix_list = check_update.then(() =>
{
	browser.storage.local.get('configuration').then(data => { publicSuffixList.parse(data.configuration.psl.list); })
});
