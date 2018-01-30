function list_stored_cookies(cookies_stores, storage)
{
	var all_store_ids = cookies_stores.map(e => e.id);
	for (const store_id of cookies_stores.map(e => e.id))
	{
		$('<h3>For cookie store </h3>').append(store_id).attr('id', store_id).appendTo('#manager');
		var jar_list = $('<ul></ul>').addClass('cookie_jars');
		Object.keys(storage).filter(k => k.endsWith('@' + store_id)).forEach(k =>
		{
			var list = $('<li></li>').text(k.split('@')[0]).appendTo(jar_list).append('<ul></ul>').addClass('profiles').children().last();
			storage[k].jars.forEach((jar, id) =>
			{
				$('<li></li>').append(jar.name || 'Unnamed profile').appendTo(list).addClass(id == storage[k].current ? 'current' : '');
			});
		});

		$('#manager').append($(jar_list).find('li.profiles li').length ? jar_list : $('<p>Nothing to show</p>'))
	}
}


check_update.then(() =>
{
	Promise.all([browser.cookies.getAllCookieStores(), browser.storage.local.get(null)]).then(([cookies_stores, storage]) =>
	{
		list_stored_cookies(cookies_stores, storage);
	});
});
