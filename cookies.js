// Run f with local storage and cookies, where url is an URL object and store_id the id of a CookieStore
// and f has takes (storage, cookies, URL, store_id) as arguments
function run_with_args(f, url, store_id)
{
	Promise.all([
		browser.storage.local.get(url.hostname + '@' + store_id),
		browser.cookies.getAll({ url: url.href })
	]).then(([storage, cookies]) =>
	{
		f(storage, cookies, url, store_id);
	});
}


function populate_cookie_list(storage, cookies, url, store_id)
{
	var cookie_select = $('#cookie-sets').empty();
	var cookie_shelf = storage[url.hostname + '@' + store_id];

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


function set_cookie(stored_cookie, url)
{
	const cookie_settable_properties = ['name', 'value', 'domain', 'path', 'secure', 'httpOnly', 'expirationDate', 'store_id'];

	// Remove non-settable properties', copy values of remaining properties, and add {'url': url} to the stored cookie
	browser.cookies.set(Object.keys(stored_cookie)
		.filter(prop => cookie_settable_properties.includes(prop))
		.reduce((settable_cookie, prop) =>
		{
			settable_cookie[prop] = stored_cookie[prop];
			return settable_cookie;
		}, { 'url': url }));
}


function swap_cookies(storage, cookies, url, store_id)
{
	var shelf = storage[url.hostname + '@' + store_id];
	var cookie_select = $('#cookie-sets');
	var new_profile = cookie_select.val();

	// Build a shelf for our cookie jars, if we don't have one
	if (typeof shelf == 'undefined')
	{
		// Default profile, with value 0, correponding <option> already exists
		storage[url.hostname + '@' + store_id] = shelf = { jars: [[]], current: 0 };
		shelf.jars[0].name = 'Default profile';
		cookie_select.val(new_profile);
	}

	// Add a new jar on the shelf if requested
	if (new_profile == 'new')
	{
		new_profile = shelf.jars.length;
		shelf.jars.push([]);
		shelf.jars[new_profile].name = 'New profile';
		$('<option>New profile</option>').attr('value', new_profile).insertBefore('#fresh-cookies');
		cookie_select.val(new_profile);
	}

	var old_jar = shelf.jars[shelf.current];
	var new_jar = shelf.jars[new_profile];

	// Replace cookies in the old jar with current cookies, and put back on shelf and in storage.
	// NB. don't assign old_jar to keep old_jar.name
	Array.prototype.splice.apply(old_jar, [0, old_jar.length].concat(cookies));
	shelf.current = new_profile;
	browser.storage.local.set(storage);


	// Remove all current cookies, and get the new jar's cookies out
	Promise.all(cookies.map((old_cookie) => browser.cookies.remove({ url: url.href, name: old_cookie.name }))).then(() =>
	{
		Promise.all(new_jar.map((new_cookie) => set_cookie(new_cookie, url.href))).then(() =>
		{
			cookie_select.val(new_profile);
			browser.tabs.query({ url: '*://*.' + url.hostname + '/*', cookieStoreId: store_id }).then((tabs) =>
			{
				tabs.forEach((tab) => { browser.tabs.reload(tab.id) });
			});
		});
	});
}


function rename_jar(storage_id)
{
	var jar_number = $('#cookie-sets').val();
	var new_name = $('#new-name').val();

	$('#new-name').val('');
	$('#rename').attr('disabled', 'disabled');

	if (jar_number == 'new')
		return;

	browser.storage.local.get(storage_id).then((storage) =>
	{
		if (typeof storage[storage_id] == 'undefined')
			storage[storage_id] = { jars: [[]], current: 0 };

		var jar = storage[storage_id].jars[jar_number];

		jar.name = new_name;
		browser.storage.local.set(storage, e => console.error(e));
		$('#cookie-sets').find('option[value=' + jar_number + ']').text(new_name);
	});
}


function delete_profile(storage, cookies, url, store_id)
{
	var jar_number = $('#cookie-sets').val();
	var storage_id = url.hostname + '@' + store_id;

	if (jar_number == 'new')
		return;

	browser.storage.local.get(storage_id).then((storage) =>
	{
		if (typeof storage[storage_id] == 'undefined')
			return;

		else if (storage[storage_id].current == jar_number)
		{
			// If last item, purge all stored info
			if (storage[storage_id].jars.length == 1)
			{
				browser.storage.local.remove(storage_id, e => console.error(e));
				storage = {}
			}
			// Do not want to switch to a different profile here
			else
				return alert('Can not delete currently used profile\n\t\t(unless it is the last one)');
		}
		else
		{
			storage[storage_id].jars.splice(jar_number, 1);
			if (storage[storage_id].current > jar_number)
				storage[storage_id].current -= 1;

			browser.storage.local.set(storage, e => console.error(e));
		}
		populate_cookie_list(storage, cookies, url, store_id);
	});
}


browser.tabs.query({ currentWindow: true, active: true }).then(tabs =>
{
	// Get the first tab object in the array
	var tab = tabs.pop();
	var url = new URL(tab.url);
	var store_id = tab.cookieStoreId;

	// Setup events
	$('#header-title').text('Cookies for ' + url.hostname);
	$('#doswap').click(() => { run_with_args(swap_cookies, url, store_id); });
	$('#delete').click(() => { run_with_args(delete_profile, url, store_id); });
	$('#rename').click(() => { rename_jar(url.hostname + '@' + store_id); });
	$('#new-name').on('input', () =>
	{
		if ($('#new-name').val())
			$('#rename').removeAttr('disabled');
		else
			$('#rename').attr('disabled', 'disabled');
	});

	// Setup the cookie list
	run_with_args(populate_cookie_list, url, store_id);
});
