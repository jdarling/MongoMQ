// "invitation" class to ensure the data matches the intended schema
function invitation(data, id) {
    
    this.id = id;
    
    this.title = String(data.title) || "Untitled";
    
    this.choices = (data.choices || []).map(function(c, index) {
        return { id: Number(c.id) || index, displayText: String(c.displayText) };
    });

    this.votes = []; // Todo: populate this later
}

module.exports = invitation;