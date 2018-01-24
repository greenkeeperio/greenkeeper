module.exports = async function (db, id) {
  try {
    return await db.remove(await db.get(id))
  } catch (e) {
    if (e.status !== 404) {
      throw e
    }
  }
}
