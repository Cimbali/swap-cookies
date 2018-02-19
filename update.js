async function from_1_0()
{
	var data = await browser.storage.local.get(null);
	Object.keys(data).filter(k => k != 'configuration').forEach(shelf =>
	{
		// Previously used an Array for jar, with a .name property added to it,
		// however this got stripped when saved for browser restart (issue #1)
		// Replace each jar that is an array with a {name: 'profile name', cookies: []} object
		storage[shelf] = storage[shelf].jars.map(jar =>
			!Array.isArray(jar) ? jar : { name: jar.name || 'Unnamed profile', cookies: jar.splice(0, jar.length) });
	});

	await browser.storage.local.set(data);
	return '1.1';
}

// serves as valid list of version names as well as mapping to which function to call
const updaters = { '1.0': from_1_0 };

function check_update()
{
	// Do the checking, return a promise that resolves whenever we have finished updating
	return new Promise(function (resolve, reject)
	{
		browser.storage.local.get('configuration').then(data =>
		{
			var version = browser.runtime.getManifest().version;
			var config = 'configuration' in data ? data.configuration : {};

			if ('version' in config && config.version in updaters)
				var update_from = config.version;
			else
				var update_from = '1.0';

			if (version == update_from)
				resolve();

			else
			{
				while (update_from != version && update_from in updaters)
					update_from = updaters[update_from];

				Object.assign(config, { version: version });
				browser.storage.local.set({ 'configuration': config }).then(resolve);
			}
		});
	});
}
