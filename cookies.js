// Run f with local storage and cookies, where url is an URL object and store_id the id of a CookieStore
// and f has takes (storage, cookies, URL, store_id) as arguments
function run_with_args(f, params)
{
	Promise.all([
		browser.storage.local.get(params.storage_id),
		browser.cookies.getAll({ domain: params.hostname })
	]).then(([storage, cookies]) =>
	{
		f(storage, cookies, params);
	});
}


function populate_cookie_list(storage, cookies, params)
{
	var cookie_select = $('#cookie-sets').empty();
	var cookie_shelf = storage[params.storage_id];

	if (cookie_shelf)
	{
		cookie_shelf.jars.forEach((saved_set, id) =>
		{
			var opt = $('<option></option>').attr('value', id).text(saved_set.name || 'Unnamed profile');
			cookie_select.append(opt);
		});
		cookie_select.append($('<option id="fresh-cookies" value="new">New batch of cookies</option>'));
		cookie_select.val(cookie_shelf.current);
	}
	else if (cookies.length)
	{
		var opt = $('<option></option>').attr('value', 0).text('Default profile');
		cookie_select.append(opt).append($('<option id="fresh-cookies" value="new">New batch of cookies</option>')).val(0);
	}
	else
	{
		cookie_select.append($('<option selected="selected">No cookies in this tab</option>')).attr('disabled', 'disabled');
		$('#doswap').attr('disabled', 'disabled');
		$('#delete').attr('disabled', 'disabled');
	}
}

function cookie_url(stored_cookie, params)
{
	// make the widest possible URL from a cookie that fits our purposes
	var cookie_url = new URL(params.url.origin);
	cookie_url.protocol = 'secure' in stored_cookie && stored_cookie.secure ? 'https:' : 'http';
	cookie_url.path = 'path' in stored_cookie ? stored_cookie.path : '/';
	cookie_url.host = 'domain' in stored_cookie ? stored_cookie.domain : params.hostname;

	if (cookie_url.host.startsWith('.')) cookie_url.host = cookie_url.host.substr(1);

	return cookie_url.href;
}


function set_cookie(stored_cookie, params)
{
	const cookie_settable_properties = ['name', 'value', 'domain', 'path', 'secure', 'httpOnly', 'expirationDate', 'store_id'];

	// Remove non-settable properties', copy values of remaining properties, and add {'url': url} to the stored cookie
	var settable_cookie = Object.keys(stored_cookie)
		.filter(prop => cookie_settable_properties.includes(prop))
		.reduce((settable_cookie, prop) =>
		{
			settable_cookie[prop] = stored_cookie[prop];
			return settable_cookie;
		}, { 'url': cookie_url(stored_cookie, params) });

	return browser.cookies.set(settable_cookie).catch(err => console.error('Error setting cookie', err));
}


function swap_cookies(storage, cookies, params)
{
	var shelf = storage[params.storage_id];
	var cookie_select = $('#cookie-sets');
	var new_profile = cookie_select.val();

	// Build a shelf for our cookie jars, if we don't have one
	if (typeof shelf == 'undefined')
	{
		// Default profile, with value 0, correponding <option> already exists
		storage[params.storage_id] = shelf = { jars: [], current: 0 };
		shelf.jars.push({ name: 'Default profile', cookies: [] });
		cookie_select.val(new_profile);
	}

	// Add a new jar on the shelf if requested
	if (new_profile == 'new')
	{
		new_profile = shelf.jars.length;
		shelf.jars.push({ name: 'New profile', cookies: [] });
		$('<option>New profile</option>').attr('value', new_profile).insertBefore('#fresh-cookies');
		cookie_select.val(new_profile);
	}

	// store current cookies back in their jar on the shelf
	shelf.jars[shelf.current].cookies = cookies
	shelf.current = new_profile;

	browser.storage.local.set(storage);

	var new_jar = shelf.jars[new_profile].cookies;

	// Remove all current cookies, and get the new jar's cookies out
	Promise.all(cookies.map((old_cookie) => browser.cookies.remove({ url: cookie_url(old_cookie, params), name: old_cookie.name }))).then(() =>
	{
		Promise.all(new_jar.map((new_cookie) => set_cookie(new_cookie, params))).then(() =>
		{
			cookie_select.val(new_profile);
			browser.tabs.query({ url: '*://*.' + params.hostname + '/*', cookieStoreId: params.cookie_store_id }).then((tabs) =>
			{
				tabs.forEach(tab =>
				{
					browser.tabs.reload(tab.id);
					browser.browserAction.setBadgeText({ tabId: tab.id, text: shelf.jars[shelf.current].name });
				});
			});
		});
	});
}


function rename_jar(params)
{
	var jar_number = $('#cookie-sets').val();
	var new_name = $('#new-name').val();

	$('#new-name').val('');
	$('#rename').attr('disabled', 'disabled');

	browser.storage.local.get(params.storage_id).then((storage) =>
	{
		if (typeof storage[params.storage_id] == 'undefined')
			storage[params.storage_id] = { jars: [{ name: 'Default Profile', cookies: [] }], current: 0 };

		if (jar_number == 'new')
		{
			jar_number = shelf.jars.length;
			shelf.jars.push({ name: new_name, cookies: [] });
			$('<option></option>').attr('value', jar_number).text(new_name).insertBefore('#fresh-cookies');
		}
		else
			storage[params.storage_id].jars[jar_number].name = new_name;

		browser.storage.local.set(storage);
		$('#cookie-sets').find('option[value=' + jar_number + ']').text(new_name);

		// If renaming the profile currently in use, adjust the badge text
		if (jar_number == storage[params.storage_id].current)
		{
			browser.tabs.query({ url: '*://*.' + params.hostname + '/*', cookieStoreId: params.cookie_store_id }).then((tabs) =>
			{
				tabs.forEach(tab => { browser.browserAction.setBadgeText({ tabId: tab.id, text: new_name }); });
			});
		}
	});
}


function delete_profile(storage, cookies, params)
{
	var jar_number = $('#cookie-sets').val();

	if (jar_number == 'new')
		return;

	browser.storage.local.get(params.storage_id).then((storage) =>
	{
		if (typeof storage[params.storage_id] == 'undefined')
			return;

		else if (storage[params.storage_id].current == jar_number)
		{
			// If last item, purge all stored info
			if (storage[params.storage_id].jars.length == 1)
			{
				browser.storage.local.remove(params.storage_id);
				storage = {}

				browser.tabs.query({ url: '*://*.' + params.hostname + '/*', cookieStoreId: params.cookie_store_id }).then((tabs) =>
				{
					tabs.forEach(tab => { browser.browserAction.setBadgeText({ tabId: tab.id, text: "" }); });
				});
			}
			// Do not want to switch to a different profile here
			else
				return alert('Can not delete currently used profile\n\t\t(unless it is the last one)');
		}
		else
		{
			storage[params.storage_id].jars.splice(jar_number, 1);
			if (storage[params.storage_id].current > jar_number)
				storage[params.storage_id].current -= 1;

			browser.storage.local.set(storage);
		}
		populate_cookie_list(storage, cookies, params);
	});
}

function get_canonical_domain_name(hostname)
{
	return new Promise((ok, no) =>
	{
		load_suffix_list.then(() => ok(publicSuffixList.getDomain(punycode.toASCII(hostname))));
	});
}


function setup(tabs)
{
	// Get the first tab object in the array
	var tab = tabs.pop();
	var url = new URL(tab.url);
	var store_id = tab.cookieStoreId;

	get_canonical_domain_name(url.hostname).then(hostname =>
	{
		var params = {
			hostname: hostname,
			storage_id: hostname + '@' + store_id,
			url: url,
			cookie_store_id: store_id
		};
		// Setup events
		$('#header-title').text('Cookies for ' + hostname);
		$('#doswap').click(() => { run_with_args(swap_cookies, params); });
		$('#delete').click(() => { run_with_args(delete_profile, params); });
		$('#rename').click(() => { rename_jar(params); });
		$('#new-name').on('input', () =>
		{
			if ($('#new-name').val())
				$('#rename').removeAttr('disabled');
			else
				$('#rename').attr('disabled', 'disabled');
		});

		// Setup the cookie list
		run_with_args(populate_cookie_list, params);
	});
}

check_update.then(() => browser.tabs.query({ currentWindow: true, active: true }).then(setup));
