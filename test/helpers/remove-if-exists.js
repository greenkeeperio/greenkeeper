module.exports = async function (db, ...ids) {
  return Promise.all(
    ids.map(async (id) => {
      try {
        return await db.remove(await db.get(id))
      } catch (e) {
        if (e.status !== 404) {
          throw e
        }
      }
    })
  )
}
