interface HelpModalProps {
	onClose: () => void;
}

export const HelpModal = ({ onClose }: HelpModalProps) => {
	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="modal-content help-modal" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h2>Don't Forget the Oatmeal!</h2>
					<button className="modal-close" onClick={onClose}>
						&times;
					</button>
				</div>
				<div className="modal-body">
					<h3>A simple grocery list app</h3>
					<p>
						You can create a personal grocery list given hash. e.g.,
						https://lucamasters.com/grocery#johnsmith
					</p>
					<p>
						You can create a list of default items that you frequently purchase by creating a second list
						with the same hash but appending "-options" to the end. e.g.,
						https://lucamasters.com/grocery#johnsmith-options
					</p>
					<p>
						All lists are saved to Cloudflare Workers, which means anyone who guesses the hash can see and
						modify your list. Don't use this for sensitive information, and consider using a less obvious
						hash.
					</p>
					<p>
						Note, however, that this feature means it will sync across devices, and can be shared with
						others. Do note that it's possible to accidentally clobber the list. It tries to combine
						intelligently if you modify on two different devices, but I recommend reloading the tab if it's
						been sitting open while you modified the list on another device.
					</p>
					<p>
						Please don't abuse this. I just want it for my own purposes, and don't want to have to add auth
						or anything.
					</p>
				</div>
				<div className="modal-footer">
					<button onClick={onClose}>Close</button>
				</div>
			</div>
		</div>
	);
};